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

	// User profile route (requires active session)
	apiV1.HandleFunc("/user/@me", RequireAuth(s.handleCurrentUser)).Methods(http.MethodGet)
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
