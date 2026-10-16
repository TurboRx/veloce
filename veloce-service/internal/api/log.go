package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/gorilla/mux"
)

func (s *Server) handleListLogs(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.logStore == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]*model.Log{})
		return
	}

	limit := 50
	offset := 0

	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	if oStr := r.URL.Query().Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	logs, err := s.logStore.ListLogsByApp(r.Context(), appID, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"database_error","message":"Failed to list logs"}`, http.StatusInternalServerError)
		return
	}

	if logs == nil {
		logs = []*model.Log{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(logs)
}
