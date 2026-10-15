package api

import (
	"encoding/json"
	"net/http"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/gorilla/mux"
)

type CreateAppRequest struct {
	Token       string  `json:"token"`
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type UpdateAppRequest struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	Enabled     *bool            `json:"enabled,omitempty"`
	Status      *json.RawMessage `json:"status,omitempty"`
	Token       *string          `json:"token,omitempty"`
}

func (s *Server) handleListApps(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	apps, err := s.appStore.ListAppsByOwner(r.Context(), user.ID)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to list apps"}`, http.StatusInternalServerError)
		return
	}

	if apps == nil {
		apps = []*model.App{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(apps)
}

func (s *Server) handleCreateApp(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json","message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		http.Error(w, `{"error":"missing_token","message":"Discord bot token is required"}`, http.StatusBadRequest)
		return
	}

	// 1. Verify token with Discord API
	botInfo, err := s.botVerifier.VerifyBotToken(r.Context(), req.Token)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "invalid_token",
			"message": err.Error(),
		})
		return
	}

	// 2. Check if bot Discord ID already registered
	existing, err := s.appStore.GetAppByDiscordID(r.Context(), botInfo.ID)
	if err == nil && existing != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "bot_already_registered",
			"message": "This Discord bot application is already registered on Veloce",
		})
		return
	}

	// 3. Encrypt bot token
	if s.tokenCrypt == nil {
		http.Error(w, `{"error":"crypt_unavailable","message":"Token encryption not configured"}`, http.StatusInternalServerError)
		return
	}

	encryptedToken, err := s.tokenCrypt.EncryptString(req.Token)
	if err != nil {
		http.Error(w, `{"error":"encryption_failed","message":"Failed to encrypt token"}`, http.StatusInternalServerError)
		return
	}

	name := botInfo.Username
	if req.Name != nil && *req.Name != "" {
		name = *req.Name
	}

	app := &model.App{
		Name:          name,
		Description:   req.Description,
		Enabled:       true,
		OwnerUserID:   user.ID,
		CreatorUserID: user.ID,
		DiscordToken:  encryptedToken,
		DiscordID:     botInfo.ID,
		DiscordAvatar: botInfo.Avatar,
	}

	created, err := s.appStore.CreateApp(r.Context(), app)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to save bot application"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(created)
}

func (s *Server) handleGetApp(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	appID := mux.Vars(r)["id"]

	app, err := s.appStore.GetAppByID(r.Context(), appID)
	if err != nil || app == nil {
		http.Error(w, `{"error":"not_found","message":"Bot app not found"}`, http.StatusNotFound)
		return
	}

	if app.OwnerUserID != user.ID {
		http.Error(w, `{"error":"forbidden","message":"You do not have access to this bot"}`, http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(app)
}

func (s *Server) handleUpdateApp(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	appID := mux.Vars(r)["id"]

	app, err := s.appStore.GetAppByID(r.Context(), appID)
	if err != nil || app == nil {
		http.Error(w, `{"error":"not_found","message":"Bot app not found"}`, http.StatusNotFound)
		return
	}

	if app.OwnerUserID != user.ID {
		http.Error(w, `{"error":"forbidden","message":"You do not have access to this bot"}`, http.StatusForbidden)
		return
	}

	var req UpdateAppRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json","message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name != nil && *req.Name != "" {
		app.Name = *req.Name
	}
	if req.Description != nil {
		app.Description = req.Description
	}
	if req.Enabled != nil {
		app.Enabled = *req.Enabled
	}
	if req.Status != nil {
		app.DiscordStatus = *req.Status
	}

	if req.Token != nil && *req.Token != "" {
		botInfo, err := s.botVerifier.VerifyBotToken(r.Context(), *req.Token)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":   "invalid_token",
				"message": err.Error(),
			})
			return
		}

		if botInfo.ID != app.DiscordID {
			http.Error(w, `{"error":"id_mismatch","message":"The new token does not match the bot application ID"}`, http.StatusBadRequest)
			return
		}

		encryptedToken, err := s.tokenCrypt.EncryptString(*req.Token)
		if err != nil {
			http.Error(w, `{"error":"encryption_failed"}`, http.StatusInternalServerError)
			return
		}

		if err := s.appStore.UpdateAppToken(r.Context(), app.ID, encryptedToken); err != nil {
			http.Error(w, `{"error":"database_error"}`, http.StatusInternalServerError)
			return
		}
	}

	updated, err := s.appStore.UpdateApp(r.Context(), app)
	if err != nil {
		http.Error(w, `{"error":"database_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(updated)
}

func (s *Server) handleDeleteApp(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	appID := mux.Vars(r)["id"]

	app, err := s.appStore.GetAppByID(r.Context(), appID)
	if err != nil || app == nil {
		http.Error(w, `{"error":"not_found","message":"Bot app not found"}`, http.StatusNotFound)
		return
	}

	if app.OwnerUserID != user.ID {
		http.Error(w, `{"error":"forbidden","message":"You do not have access to this bot"}`, http.StatusForbidden)
		return
	}

	if err := s.appStore.DeleteApp(r.Context(), appID); err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to delete bot app"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"deleted"}`))
}
