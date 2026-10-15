package api

import (
	"encoding/json"
	"net/http"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/gorilla/mux"
)

type CreateCommandRequest struct {
	Name        string        `json:"name"`
	Description string        `json:"description"`
	FlowSource  flow.FlowData `json:"flow_source"`
}

type UpdateCommandRequest struct {
	Name        *string        `json:"name,omitempty"`
	Description *string        `json:"description,omitempty"`
	Enabled     *bool          `json:"enabled,omitempty"`
	FlowSource  *flow.FlowData `json:"flow_source,omitempty"`
}

func (s *Server) verifyAppOwnership(w http.ResponseWriter, r *http.Request, appID string) (*model.App, bool) {
	user := GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return nil, false
	}

	app, err := s.appStore.GetAppByID(r.Context(), appID)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to fetch app"}`, http.StatusInternalServerError)
		return nil, false
	}
	if app == nil {
		http.Error(w, `{"error":"not_found","message":"App not found"}`, http.StatusNotFound)
		return nil, false
	}

	if app.OwnerUserID != user.ID {
		http.Error(w, `{"error":"forbidden","message":"You do not own this app"}`, http.StatusForbidden)
		return nil, false
	}

	return app, true
}

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	commands, err := s.commandStore.ListCommandsByApp(r.Context(), appID)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to list commands"}`, http.StatusInternalServerError)
		return
	}

	if commands == nil {
		commands = []*model.Command{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(commands)
}

func (s *Server) handleCreateCommand(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	user := GetUserFromContext(r.Context())
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	var req CreateCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json","message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"missing_name","message":"Command name is required"}`, http.StatusBadRequest)
		return
	}

	// Validate flow compilation
	if _, err := flow.CompileCommand(req.FlowSource); err != nil {
		http.Error(w, `{"error":"invalid_flow","message":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	cmd := &model.Command{
		Name:          req.Name,
		Description:   req.Description,
		Enabled:       true,
		AppID:         appID,
		CreatorUserID: user.ID,
		FlowSource:    req.FlowSource,
	}

	created, err := s.commandStore.CreateCommand(r.Context(), cmd)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to save command"}`, http.StatusInternalServerError)
		return
	}

	// Automatically queue deploy
	_ = s.appStore.QueueAppCommandsDeploy(r.Context(), appID, false)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(created)
}

func (s *Server) handleGetCommand(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	cmdID := mux.Vars(r)["id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	cmd, err := s.commandStore.GetCommandByID(r.Context(), cmdID)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to get command"}`, http.StatusInternalServerError)
		return
	}
	if cmd == nil || cmd.AppID != appID {
		http.Error(w, `{"error":"not_found","message":"Command not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cmd)
}

func (s *Server) handleUpdateCommand(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	cmdID := mux.Vars(r)["id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	cmd, err := s.commandStore.GetCommandByID(r.Context(), cmdID)
	if err != nil || cmd == nil || cmd.AppID != appID {
		http.Error(w, `{"error":"not_found","message":"Command not found"}`, http.StatusNotFound)
		return
	}

	var req UpdateCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json","message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name != nil {
		cmd.Name = *req.Name
	}
	if req.Description != nil {
		cmd.Description = *req.Description
	}
	if req.Enabled != nil {
		cmd.Enabled = *req.Enabled
	}
	if req.FlowSource != nil {
		// Validate new flow
		if _, err := flow.CompileCommand(*req.FlowSource); err != nil {
			http.Error(w, `{"error":"invalid_flow","message":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		cmd.FlowSource = *req.FlowSource
	}

	updated, err := s.commandStore.UpdateCommand(r.Context(), cmd)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to update command"}`, http.StatusInternalServerError)
		return
	}

	// Queue deployment update
	_ = s.appStore.QueueAppCommandsDeploy(r.Context(), appID, false)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(updated)
}

func (s *Server) handleDeleteCommand(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	cmdID := mux.Vars(r)["id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	cmd, err := s.commandStore.GetCommandByID(r.Context(), cmdID)
	if err != nil || cmd == nil || cmd.AppID != appID {
		http.Error(w, `{"error":"not_found","message":"Command not found"}`, http.StatusNotFound)
		return
	}

	if err := s.commandStore.DeleteCommand(r.Context(), cmdID); err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to delete command"}`, http.StatusInternalServerError)
		return
	}

	// Queue redeploy
	_ = s.appStore.QueueAppCommandsDeploy(r.Context(), appID, false)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (s *Server) handleDeployCommands(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if err := s.appStore.QueueAppCommandsDeploy(r.Context(), appID, true); err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to queue command deploy"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"queued": true})
}
