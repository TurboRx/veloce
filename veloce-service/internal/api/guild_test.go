package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/core/gateway"
	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/diamondburned/arikawa/v3/discord"
)

type mockGatewayInspector struct {
	status gateway.GatewayAppStatus
	guilds []discord.Guild
}

func (m *mockGatewayInspector) GetAppStatus(appID string) gateway.GatewayAppStatus {
	return m.status
}

func (m *mockGatewayInspector) ListGuilds(appID string) ([]discord.Guild, error) {
	return m.guilds, nil
}

func TestGatewayStatusAndGuildsEndpoints(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{Port: 8080, PublicBaseURL: "http://localhost:3000"},
	}
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	crypt, _ := util.NewSymmetricCrypt(key)

	appStore := &mockAppStore{apps: make(map[string]*model.App)}
	ownerUser := &model.User{ID: "usr_owner_1"}
	appStore.apps["app_123"] = &model.App{
		ID:          "app_123",
		Name:        "Test Bot",
		OwnerUserID: ownerUser.ID,
	}

	mockInspector := &mockGatewayInspector{
		status: gateway.GatewayAppStatus{
			Connected:  true,
			LastPingAt: time.Now().UTC(),
			GuildCount: 2,
		},
		guilds: []discord.Guild{
			{
				ID:   discord.GuildID(123456),
				Name: "Developers Hub",
				Icon: "icon_hash_1",
			},
			{
				ID:   discord.GuildID(789012),
				Name: "Gaming Lounge",
				Icon: "icon_hash_2",
			},
		},
	}

	server := NewServer(cfg, nil, nil, appStore, nil, crypt, &mockBotVerifier{})
	server.SetGatewayInspector(mockInspector)

	// 1. Gateway Status Endpoint
	reqStatus := httptest.NewRequest(http.MethodGet, "/v1/apps/app_123/gateway", nil)
	reqStatus = reqStatus.WithContext(context.WithValue(reqStatus.Context(), UserContextKey, ownerUser))
	rrStatus := httptest.NewRecorder()
	server.router.ServeHTTP(rrStatus, reqStatus)

	if rrStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rrStatus.Code, rrStatus.Body.String())
	}

	var statusResp GatewayStatusResponse
	if err := json.Unmarshal(rrStatus.Body.Bytes(), &statusResp); err != nil {
		t.Fatalf("failed to decode gateway status: %v", err)
	}

	if !statusResp.Connected {
		t.Errorf("expected Connected=true, got false")
	}
	if statusResp.GuildCount != 2 {
		t.Errorf("expected GuildCount=2, got %d", statusResp.GuildCount)
	}

	// 2. Guilds List Endpoint
	reqGuilds := httptest.NewRequest(http.MethodGet, "/v1/apps/app_123/guilds", nil)
	reqGuilds = reqGuilds.WithContext(context.WithValue(reqGuilds.Context(), UserContextKey, ownerUser))
	rrGuilds := httptest.NewRecorder()
	server.router.ServeHTTP(rrGuilds, reqGuilds)

	if rrGuilds.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rrGuilds.Code, rrGuilds.Body.String())
	}

	var guildsResp []GuildResponse
	if err := json.Unmarshal(rrGuilds.Body.Bytes(), &guildsResp); err != nil {
		t.Fatalf("failed to decode guilds: %v", err)
	}

	if len(guildsResp) != 2 {
		t.Fatalf("expected 2 guilds, got %d", len(guildsResp))
	}
	if guildsResp[0].Name != "Developers Hub" {
		t.Errorf("expected Developers Hub, got %s", guildsResp[0].Name)
	}
	if guildsResp[1].Name != "Gaming Lounge" {
		t.Errorf("expected Gaming Lounge, got %s", guildsResp[1].Name)
	}
}
