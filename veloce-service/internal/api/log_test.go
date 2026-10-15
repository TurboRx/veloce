package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
)

type mockLogStoreForAPI struct {
	logs []*model.Log
}

func (m *mockLogStoreForAPI) CreateLog(ctx context.Context, log *model.Log) (*model.Log, error) {
	m.logs = append(m.logs, log)
	return log, nil
}

func (m *mockLogStoreForAPI) ListLogsByApp(ctx context.Context, appID string, limit, offset int) ([]*model.Log, error) {
	return m.logs, nil
}

func (m *mockLogStoreForAPI) DeleteOldLogs(ctx context.Context, olderThan time.Time) error {
	return nil
}

func TestListLogsEndpoint(t *testing.T) {
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

	logStore := &mockLogStoreForAPI{
		logs: []*model.Log{
			{
				ID:        1,
				AppID:     "app_123",
				Message:   "Executed /ping",
				Level:     model.LogLevelInfo,
				Details:   map[string]any{"duration_ms": 15},
				CreatedAt: time.Now().UTC(),
			},
		},
	}

	server := NewServer(cfg, nil, nil, appStore, nil, crypt, &mockBotVerifier{})
	server.SetLogStore(logStore)

	// 1. Authorized Owner Request
	req := httptest.NewRequest(http.MethodGet, "/v1/apps/app_123/logs", nil)
	ctx := context.WithValue(req.Context(), UserContextKey, ownerUser)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	server.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
	}

	var logs []*model.Log
	if err := json.Unmarshal(rr.Body.Bytes(), &logs); err != nil {
		t.Fatalf("failed to decode logs response: %v", err)
	}

	if len(logs) != 1 {
		t.Fatalf("expected 1 log, got %d", len(logs))
	}
	if logs[0].Message != "Executed /ping" {
		t.Errorf("expected Executed /ping, got %s", logs[0].Message)
	}

	// 2. Forbidden non-owner request
	otherUser := &model.User{ID: "usr_other_99"}
	reqOther := httptest.NewRequest(http.MethodGet, "/v1/apps/app_123/logs", nil)
	reqOther = reqOther.WithContext(context.WithValue(reqOther.Context(), UserContextKey, otherUser))
	rrOther := httptest.NewRecorder()
	server.router.ServeHTTP(rrOther, reqOther)

	if rrOther.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for non-owner, got %d", rrOther.Code)
	}
}
