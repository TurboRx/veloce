package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Version   string    `json:"version"`
}

func (s *Server) registerRoutes(r *mux.Router) {
	apiV1 := r.PathPrefix("/v1").Subrouter()

	apiV1.HandleFunc("/health", s.handleHealth).Methods(http.MethodGet)

	// Authentication routes
	apiV1.HandleFunc("/auth/login", s.handleAuthLogin).Methods(http.MethodGet)
	apiV1.HandleFunc("/auth/callback", s.handleAuthCallback).Methods(http.MethodGet)
	apiV1.HandleFunc("/auth/logout", s.handleAuthLogout).Methods(http.MethodGet, http.MethodPost)

	// User profile route
	apiV1.HandleFunc("/user/@me", RequireAuth(s.handleCurrentUser)).Methods(http.MethodGet)

	// App & Bot Management routes
	apiV1.HandleFunc("/apps", RequireAuth(s.handleListApps)).Methods(http.MethodGet)
	apiV1.HandleFunc("/apps", RequireAuth(s.handleCreateApp)).Methods(http.MethodPost)
	apiV1.HandleFunc("/apps/{id}", RequireAuth(s.handleGetApp)).Methods(http.MethodGet)
	apiV1.HandleFunc("/apps/{id}", RequireAuth(s.handleUpdateApp)).Methods(http.MethodPatch)
	apiV1.HandleFunc("/apps/{id}", RequireAuth(s.handleDeleteApp)).Methods(http.MethodDelete)

	// Command Flow routes
	apiV1.HandleFunc("/apps/{app_id}/commands", RequireAuth(s.handleListCommands)).Methods(http.MethodGet)
	apiV1.HandleFunc("/apps/{app_id}/commands", RequireAuth(s.handleCreateCommand)).Methods(http.MethodPost)
	apiV1.HandleFunc("/apps/{app_id}/commands/{id}", RequireAuth(s.handleGetCommand)).Methods(http.MethodGet)
	apiV1.HandleFunc("/apps/{app_id}/commands/{id}", RequireAuth(s.handleUpdateCommand)).Methods(http.MethodPatch)
	apiV1.HandleFunc("/apps/{app_id}/commands/{id}", RequireAuth(s.handleDeleteCommand)).Methods(http.MethodDelete)
	apiV1.HandleFunc("/apps/{app_id}/commands/deploy", RequireAuth(s.handleDeployCommands)).Methods(http.MethodPost)

	// Telemetry & Logs routes
	apiV1.HandleFunc("/apps/{app_id}/logs", RequireAuth(s.handleListLogs)).Methods(http.MethodGet)
	apiV1.HandleFunc("/apps/{app_id}/gateway", RequireAuth(s.handleGetGatewayStatus)).Methods(http.MethodGet)
	apiV1.HandleFunc("/apps/{app_id}/guilds", RequireAuth(s.handleListGuilds)).Methods(http.MethodGet)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now().UTC(),
		Version:   "0.1.0",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
