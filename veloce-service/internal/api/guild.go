package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

type GatewayStatusResponse struct {
	Connected  bool       `json:"connected"`
	LastPingAt *time.Time `json:"last_ping_at,omitempty"`
	GuildCount int        `json:"guild_count"`
}

type GuildResponse struct {
	ID                     string `json:"id"`
	Name                   string `json:"name"`
	Icon                   string `json:"icon,omitempty"`
	ApproximateMemberCount uint64 `json:"approximate_member_count,omitempty"`
	OwnerID                string `json:"owner_id,omitempty"`
}

func (s *Server) handleGetGatewayStatus(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.gatewayInspector == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(GatewayStatusResponse{
			Connected:  false,
			GuildCount: 0,
		})
		return
	}

	status := s.gatewayInspector.GetAppStatus(appID)
	resp := GatewayStatusResponse{
		Connected:  status.Connected,
		GuildCount: status.GuildCount,
	}
	if !status.LastPingAt.IsZero() {
		resp.LastPingAt = &status.LastPingAt
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleListGuilds(w http.ResponseWriter, r *http.Request) {
	appID := mux.Vars(r)["app_id"]
	if _, ok := s.verifyAppOwnership(w, r, appID); !ok {
		return
	}

	if s.gatewayInspector == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]GuildResponse{})
		return
	}

	discordGuilds, err := s.gatewayInspector.ListGuilds(appID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]GuildResponse{})
		return
	}

	res := make([]GuildResponse, 0, len(discordGuilds))
	for _, g := range discordGuilds {
		res = append(res, GuildResponse{
			ID:                     g.ID.String(),
			Name:                   g.Name,
			Icon:                   g.IconURL(),
			ApproximateMemberCount: g.ApproximateMembers,
			OwnerID:                g.OwnerID.String(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
