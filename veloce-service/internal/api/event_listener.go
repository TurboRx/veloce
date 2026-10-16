package api

import (
	"encoding/json"
	"net/http"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/gorilla/mux"
)

type CreateEventListenerRequest struct {
	Source      model.EventSource          `json:"source"`
	Type        model.EventListenerType    `json:"type"`
	Description string                     `json:"description"`
	Filter      *model.EventListenerFilter `json:"filter,omitempty"`
	FlowSource  flow.FlowData              `json:"flow_source"`
}

type UpdateEventListenerRequest struct {
	Type        *model.EventListenerType    `json:"type,omitempty"`
	Description *string                     `json:"description,omitempty"`
	Enabled     *bool                       `json:"enabled,omitempty"`
	Filter      *model.EventListenerFilter  `json:"filter,omitempty"`
	FlowSource  *flow.FlowData              `json:"flow_source,omitempty"`
}

func (s *Server) handleListEventListeners(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.eventListenerStore == nil {
		http.Error(w, `{"error":"service_unavailable","message":"Event listener store is not configured"}`, http.StatusServiceUnavailable)
		return
	}

	listeners, err := s.eventListenerStore.ListEventListenersByApp(r.Context(), appID)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to list event listeners"}`, http.StatusInternalServerError)
		return
	}

	if listeners == nil {
		listeners = []*model.EventListener{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(listeners)
}

func (s *Server) handleCreateEventListener(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	user := GetUserFromContext(r.Context())
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.eventListenerStore == nil {
		http.Error(w, `{"error":"service_unavailable","message":"Event listener store is not configured"}`, http.StatusServiceUnavailable)
		return
	}

	var req CreateEventListenerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json","message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Type == "" {
		http.Error(w, `{"error":"missing_type","message":"Event type is required"}`, http.StatusBadRequest)
		return
	}

	if req.Source == "" {
		req.Source = model.EventSourceDiscord
	}

	// Validate flow compilation
	if _, err := flow.CompileEventListener(req.FlowSource); err != nil {
		http.Error(w, `{"error":"invalid_flow","message":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	listener := &model.EventListener{
		Source:        req.Source,
		Type:          req.Type,
		Description:   req.Description,
		Enabled:       true,
		AppID:         appID,
		CreatorUserID: user.ID,
		Filter:        req.Filter,
		FlowSource:    req.FlowSource,
	}

	created, err := s.eventListenerStore.CreateEventListener(r.Context(), listener)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to save event listener"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(created)
}

func (s *Server) handleGetEventListener(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	listenerID := mux.Vars(r)["id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.eventListenerStore == nil {
		http.Error(w, `{"error":"service_unavailable","message":"Event listener store is not configured"}`, http.StatusServiceUnavailable)
		return
	}

	listener, err := s.eventListenerStore.GetEventListenerByID(r.Context(), listenerID)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to get event listener"}`, http.StatusInternalServerError)
		return
	}
	if listener == nil || listener.AppID != appID {
		http.Error(w, `{"error":"not_found","message":"Event listener not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(listener)
}

func (s *Server) handleUpdateEventListener(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	listenerID := mux.Vars(r)["id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.eventListenerStore == nil {
		http.Error(w, `{"error":"service_unavailable","message":"Event listener store is not configured"}`, http.StatusServiceUnavailable)
		return
	}

	listener, err := s.eventListenerStore.GetEventListenerByID(r.Context(), listenerID)
	if err != nil || listener == nil || listener.AppID != appID {
		http.Error(w, `{"error":"not_found","message":"Event listener not found"}`, http.StatusNotFound)
		return
	}

	var req UpdateEventListenerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json","message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Type != nil {
		listener.Type = *req.Type
	}
	if req.Description != nil {
		listener.Description = *req.Description
	}
	if req.Enabled != nil {
		listener.Enabled = *req.Enabled
	}
	if req.Filter != nil {
		listener.Filter = req.Filter
	}
	if req.FlowSource != nil {
		if _, err := flow.CompileEventListener(*req.FlowSource); err != nil {
			http.Error(w, `{"error":"invalid_flow","message":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		listener.FlowSource = *req.FlowSource
	}

	updated, err := s.eventListenerStore.UpdateEventListener(r.Context(), listener)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to update event listener"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(updated)
}

func (s *Server) handleDeleteEventListener(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	listenerID := mux.Vars(r)["id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.eventListenerStore == nil {
		http.Error(w, `{"error":"service_unavailable","message":"Event listener store is not configured"}`, http.StatusServiceUnavailable)
		return
	}

	listener, err := s.eventListenerStore.GetEventListenerByID(r.Context(), listenerID)
	if err != nil || listener == nil || listener.AppID != appID {
		http.Error(w, `{"error":"not_found","message":"Event listener not found"}`, http.StatusNotFound)
		return
	}

	if err := s.eventListenerStore.DeleteEventListener(r.Context(), listenerID); err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to delete event listener"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
