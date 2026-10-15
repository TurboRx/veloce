package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
)

type mockAppStore struct {
	apps map[string]*model.App
}

func (m *mockAppStore) CreateApp(ctx context.Context, app *model.App) (*model.App, error) {
	app.ID = "app_123"
	m.apps[app.ID] = app
	return app, nil
}

func (m *mockAppStore) GetAppByID(ctx context.Context, id string) (*model.App, error) {
	return m.apps[id], nil
}

func (m *mockAppStore) GetAppByDiscordID(ctx context.Context, discordID string) (*model.App, error) {
	for _, a := range m.apps {
		if a.DiscordID == discordID {
			return a, nil
		}
	}
	return nil, nil
}

func (m *mockAppStore) ListAppsByOwner(ctx context.Context, ownerUserID string) ([]*model.App, error) {
	var list []*model.App
	for _, a := range m.apps {
		if a.OwnerUserID == ownerUserID {
			list = append(list, a)
		}
	}
	return list, nil
}

func (m *mockAppStore) UpdateApp(ctx context.Context, app *model.App) (*model.App, error) {
	m.apps[app.ID] = app
	return app, nil
}

func (m *mockAppStore) UpdateAppToken(ctx context.Context, appID string, encryptedToken string) error {
	if a, ok := m.apps[appID]; ok {
		a.DiscordToken = encryptedToken
	}
	return nil
}

func (m *mockAppStore) DeleteApp(ctx context.Context, id string) error {
	delete(m.apps, id)
	return nil
}

func (m *mockAppStore) QueueAppCommandsDeploy(ctx context.Context, appID string, force bool) error {
	return nil
}

func (m *mockAppStore) ListActiveApps(ctx context.Context, clusterCount, clusterIndex int) ([]*model.App, error) {
	var active []*model.App
	for _, a := range m.apps {
		if a.Enabled {
			active = append(active, a)
		}
	}
	return active, nil
}

type mockBotVerifier struct{}

func (m *mockBotVerifier) VerifyBotToken(ctx context.Context, token string) (*util.DiscordBotInfo, error) {
	if token == "valid_token" {
		username := "VeloceBot"
		return &util.DiscordBotInfo{
			ID:       "1122334455",
			Username: username,
			Bot:      true,
		}, nil
	}
	return nil, http.ErrNotSupported
}

func TestAppEndpoints(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{PublicBaseURL: "http://localhost:8080"},
	}

	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	crypt, _ := util.NewSymmetricCrypt(key)

	store := &mockAppStore{apps: make(map[string]*model.App)}
	server := NewServer(cfg, nil, nil, store, crypt, &mockBotVerifier{})

	user := &model.User{ID: "usr_owner_1"}

	// 1. Create App
	body, _ := json.Marshal(CreateAppRequest{
		Token: "valid_token",
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/apps", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rr := httptest.NewRecorder()
	server.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
	}

	var created model.App
	_ = json.Unmarshal(rr.Body.Bytes(), &created)
	if created.Name != "VeloceBot" {
		t.Errorf("expected bot name 'VeloceBot', got '%s'", created.Name)
	}

	// 2. List Apps
	reqList := httptest.NewRequest(http.MethodGet, "/v1/apps", nil)
	reqList = reqList.WithContext(context.WithValue(reqList.Context(), UserContextKey, user))
	rrList := httptest.NewRecorder()
	server.router.ServeHTTP(rrList, reqList)

	if rrList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rrList.Code)
	}

	var list []*model.App
	_ = json.Unmarshal(rrList.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("expected 1 app, got %d", len(list))
	}
}
