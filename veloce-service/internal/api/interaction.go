package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/utils/json/option"
	"github.com/gorilla/mux"
)

// handleDiscordInteraction processes inbound Discord HTTP interactions (webhooks).
// It verifies the Ed25519 cryptographic signature and executes matching command flows
// with zero background gateway processes (100% serverless compatible).
func (s *Server) handleDiscordInteraction(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if appID == "" {
		http.Error(w, `{"error":"missing_app_id"}`, http.StatusBadRequest)
		return
	}

	sigHex := r.Header.Get("X-Signature-Ed25519")
	timestamp := r.Header.Get("X-Signature-Timestamp")
	if sigHex == "" || timestamp == "" {
		http.Error(w, `{"error":"unauthorized","message":"Missing signature headers"}`, http.StatusUnauthorized)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"bad_request","message":"Failed to read body"}`, http.StatusBadRequest)
		return
	}

	// 1. Fetch app and public key
	app, err := s.appStore.GetAppByID(r.Context(), appID)
	if err != nil || app == nil {
		http.Error(w, `{"error":"app_not_found"}`, http.StatusNotFound)
		return
	}

	if app.DiscordPublicKey == nil || *app.DiscordPublicKey == "" {
		http.Error(w, `{"error":"public_key_missing","message":"Discord Public Key not configured for this app"}`, http.StatusBadRequest)
		return
	}

	// 2. Cryptographic signature verification
	if !util.VerifyDiscordInteraction(*app.DiscordPublicKey, sigHex, timestamp, body) {
		http.Error(w, `{"error":"invalid_signature"}`, http.StatusUnauthorized)
		return
	}

	// 3. Parse interaction event
	var interaction discord.InteractionEvent
	if err := json.Unmarshal(body, &interaction); err != nil {
		http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
		return
	}

	if interaction.Data == nil {
		http.Error(w, `{"error":"missing_interaction_data"}`, http.StatusBadRequest)
		return
	}

	// 4. Handle Discord Ping/Pong verification (Handshake when saving URL in portal)
	if interaction.Data.InteractionType() == discord.PingInteractionType {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"type":1}`))
		return
	}

	// 5. Handle Command Interactions
	if interaction.Data.InteractionType() == discord.CommandInteractionType {
		cmdData, ok := interaction.Data.(*discord.CommandInteraction)
		if !ok || cmdData == nil {
			http.Error(w, `{"error":"invalid_command_data"}`, http.StatusBadRequest)
			return
		}

		commands, err := s.commandStore.ListEnabledCommandsByApp(r.Context(), app.ID)
		if err != nil {
			slog.Error("Failed to list commands for HTTP interaction",
				slog.String("app_id", app.ID),
				slog.String("error", err.Error()),
			)
			http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
			return
		}

		for _, cmd := range commands {
			if cmd.Name == cmdData.Name {
				compiled, err := flow.CompileCommand(cmd.FlowSource)
				if err != nil {
					slog.Error("Failed to compile command flow for HTTP interaction",
						slog.String("app_id", app.ID),
						slog.String("command_name", cmd.Name),
						slog.String("error", err.Error()),
					)
					s.recordInteractionLog(app.ID, "Failed compiling flow for /"+cmd.Name+": "+err.Error(), model.LogLevelError, map[string]any{
						"command_name": cmd.Name,
						"error":        err.Error(),
						"type":         "serverless_http",
					})
					http.Error(w, `{"error":"compile_error"}`, http.StatusInternalServerError)
					return
				}

				flowCtx := flow.NewFlowContext(r.Context(), 10*time.Second, nil, &interaction)
				start := time.Now()
				execErr := compiled.Execute(flowCtx)
				duration := time.Since(start)

				details := map[string]any{
					"command_id":   cmd.ID,
					"command_name": cmd.Name,
					"duration_ms":  duration.Milliseconds(),
					"mode":         "serverless_http",
					"status":       "success",
				}
				if sender := interaction.Sender(); sender != nil {
					details["user_id"] = sender.ID.String()
					details["username"] = sender.Username
				}
				if interaction.GuildID.IsValid() {
					details["guild_id"] = interaction.GuildID.String()
				}
				if interaction.ChannelID.IsValid() {
					details["channel_id"] = interaction.ChannelID.String()
				}

				if execErr != nil {
					details["status"] = "error"
					details["error"] = execErr.Error()
					s.recordInteractionLog(app.ID, "Failed executing /"+cmd.Name+": "+execErr.Error(), model.LogLevelError, details)
				} else {
					s.recordInteractionLog(app.ID, "Executed /"+cmd.Name+" (serverless)", model.LogLevelInfo, details)
				}

				// If flow generated an initial response, return it synchronously in the HTTP body
				w.Header().Set("Content-Type", "application/json")
				if httpResp := flowCtx.GetHTTPResponse(); httpResp != nil {
					w.WriteHeader(http.StatusOK)
					_ = json.NewEncoder(w).Encode(httpResp)
					return
				}

				// Fallback: Default deferred channel message ACK if no explicit response block executed
				w.WriteHeader(http.StatusOK)
				_ = json.NewEncoder(w).Encode(api.InteractionResponse{
					Type: api.DeferredMessageInteractionWithSource,
				})
				return
			}
		}

		// Command not found
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(api.InteractionResponse{
			Type: api.MessageInteractionWithSource,
			Data: &api.InteractionResponseData{
				Content: option.NewNullableString("Command not found or disabled."),
				Flags:   discord.EphemeralMessage,
			},
		})
		return
	}

	// Other interaction types (component button, select, modal)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(api.InteractionResponse{
		Type: api.DeferredMessageUpdate,
	})
}

func (s *Server) recordInteractionLog(appID, message string, level model.LogLevel, details map[string]any) {
	if s.logStore == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = s.logStore.CreateLog(ctx, &model.Log{
			AppID:     appID,
			Message:   message,
			Level:     level,
			Details:   details,
			CreatedAt: time.Now().UTC(),
		})
	}()
}
