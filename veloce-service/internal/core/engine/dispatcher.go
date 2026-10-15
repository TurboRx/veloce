package engine

import (
	"context"
	"log/slog"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/store"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type InteractionDispatcher struct {
	commandStore store.CommandStore
	logStore     store.LogStore
}

func NewInteractionDispatcher(commandStore store.CommandStore, logStore ...store.LogStore) *InteractionDispatcher {
	d := &InteractionDispatcher{
		commandStore: commandStore,
	}
	if len(logStore) > 0 {
		d.logStore = logStore[0]
	}
	return d
}

// HandleEvent processes incoming Discord gateway events and executes matching flows.
func (d *InteractionDispatcher) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	switch e := event.(type) {
	case *gateway.InteractionCreateEvent:
		d.handleInteraction(ctx, appID, session, e)
	}
}

func (d *InteractionDispatcher) handleInteraction(
	parentCtx context.Context,
	appID string,
	session *state.State,
	e *gateway.InteractionCreateEvent,
) {
	if e.Data == nil || e.Data.InteractionType() != discord.CommandInteractionType {
		return
	}

	cmdData, ok := e.Data.(*discord.CommandInteraction)
	if !ok {
		return
	}

	commands, err := d.commandStore.ListEnabledCommandsByApp(parentCtx, appID)
	if err != nil {
		slog.Error("Failed to list commands for interaction",
			slog.String("app_id", appID),
			slog.String("error", err.Error()),
		)
		return
	}

	for _, cmd := range commands {
		if cmd.Name == cmdData.Name {
			compiled, err := flow.CompileCommand(cmd.FlowSource)
			if err != nil {
				slog.Error("Failed to compile command flow for execution",
					slog.String("app_id", appID),
					slog.String("command_name", cmd.Name),
					slog.String("error", err.Error()),
				)
				d.recordLog(appID, "Failed compiling flow for /"+cmd.Name+": "+err.Error(), model.LogLevelError, map[string]any{
					"command_name": cmd.Name,
					"error":        err.Error(),
					"status":       "compile_error",
				})
				return
			}

			// Flow execution context with 30s max execution window
			flowCtx := flow.NewFlowContext(parentCtx, 30*time.Second, session, &e.InteractionEvent)

			// Auto-defer interaction before Discord's 3-second deadline if still executing
			autoDeferTimer := time.AfterFunc(2300*time.Millisecond, func() {
				if !flowCtx.HasResponded() && session != nil {
					resp := api.InteractionResponse{
						Type: api.DeferredMessageInteractionWithSource,
					}
					if err := session.RespondInteraction(e.ID, e.Token, resp); err == nil {
						flowCtx.MarkResponded()
					}
				}
			})
			defer autoDeferTimer.Stop()

			start := time.Now()
			execErr := compiled.Execute(flowCtx)
			duration := time.Since(start)

			details := map[string]any{
				"command_id":   cmd.ID,
				"command_name": cmd.Name,
				"duration_ms":  duration.Milliseconds(),
				"status":       "success",
			}
			if sender := e.Sender(); sender != nil {
				details["user_id"] = sender.ID.String()
				details["username"] = sender.Username
			}
			if e.GuildID.IsValid() {
				details["guild_id"] = e.GuildID.String()
			}
			if e.ChannelID.IsValid() {
				details["channel_id"] = e.ChannelID.String()
			}

			if execErr != nil {
				details["status"] = "error"
				details["error"] = execErr.Error()
				slog.Error("Flow execution failed",
					slog.String("app_id", appID),
					slog.String("command_name", cmd.Name),
					slog.String("error", execErr.Error()),
				)
				d.recordLog(appID, "Failed executing /"+cmd.Name+": "+execErr.Error(), model.LogLevelError, details)
			} else {
				d.recordLog(appID, "Successfully executed /"+cmd.Name, model.LogLevelInfo, details)
			}
			return
		}
	}
}

func (d *InteractionDispatcher) recordLog(appID, message string, level model.LogLevel, details map[string]any) {
	if d.logStore == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = d.logStore.CreateLog(ctx, &model.Log{
			AppID:     appID,
			Message:   message,
			Level:     level,
			Details:   details,
			CreatedAt: time.Now().UTC(),
		})
	}()
}
