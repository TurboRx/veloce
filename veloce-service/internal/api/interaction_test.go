package api

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
)

type mockAppStoreForInteractions struct {
	app *model.App
}

func (m *mockAppStoreForInteractions) CreateApp(ctx context.Context, app *model.App) (*model.App, error) {
	return app, nil
}
func (m *mockAppStoreForInteractions) GetAppByID(ctx context.Context, id string) (*model.App, error) {
	if m.app != nil && m.app.ID == id {
		return m.app, nil
	}
	return nil, nil
}
func (m *mockAppStoreForInteractions) GetAppByDiscordID(ctx context.Context, discordID string) (*model.App, error) {
	return m.app, nil
}
func (m *mockAppStoreForInteractions) ListAppsByOwner(ctx context.Context, ownerUserID string) ([]*model.App, error) {
	return []*model.App{m.app}, nil
}
func (m *mockAppStoreForInteractions) UpdateApp(ctx context.Context, app *model.App) (*model.App, error) {
	return app, nil
}
func (m *mockAppStoreForInteractions) UpdateAppToken(ctx context.Context, appID string, encryptedToken string) error {
	return nil
}
func (m *mockAppStoreForInteractions) DeleteApp(ctx context.Context, id string) error {
	return nil
}
func (m *mockAppStoreForInteractions) QueueAppCommandsDeploy(ctx context.Context, appID string, force bool) error {
	return nil
}
func (m *mockAppStoreForInteractions) ListActiveApps(ctx context.Context, clusterCount, clusterIndex int) ([]*model.App, error) {
	return []*model.App{m.app}, nil
}
func (m *mockAppStoreForInteractions) AppIDsWithDueCommandsDeploy(ctx context.Context, limit int) ([]string, error) {
	return nil, nil
}
func (m *mockAppStoreForInteractions) UpdateCommandsDeployResult(ctx context.Context, appID string, hash string, deployError *string) error {
	return nil
}

type mockCommandStoreForInteractions struct {
	commands []*model.Command
}

func (m *mockCommandStoreForInteractions) CreateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	return cmd, nil
}
func (m *mockCommandStoreForInteractions) GetCommandByID(ctx context.Context, id string) (*model.Command, error) {
	for _, c := range m.commands {
		if c.ID == id {
			return c, nil
		}
	}
	return nil, nil
}
func (m *mockCommandStoreForInteractions) ListCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	return m.commands, nil
}
func (m *mockCommandStoreForInteractions) ListEnabledCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	return m.commands, nil
}
func (m *mockCommandStoreForInteractions) UpdateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	return cmd, nil
}
func (m *mockCommandStoreForInteractions) DeleteCommand(ctx context.Context, id string) error {
	return nil
}
func (m *mockCommandStoreForInteractions) UpdateLastDeployed(ctx context.Context, commandIDs []string) error {
	return nil
}

func TestDiscordInteractionEndpoint(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed generating ed25519 key: %v", err)
	}
	pubHex := hex.EncodeToString(pub)

	app := &model.App{
		ID:               "app_123",
		Name:             "ServerlessBot",
		DiscordID:        "999888777",
		DiscordPublicKey: &pubHex,
		Enabled:          true,
	}

	flowJSON := `{
		"nodes": [
			{"id": "entry_1", "type": "entry_command", "data": {"name": "ping"}},
			{"id": "action_1", "type": "action_response_create", "data": {"response_content": "Pong from Serverless!"}}
		],
		"edges": [
			{"id": "e1", "source": "entry_1", "target": "action_1"}
		]
	}`

	var flowData flow.FlowData
	if err := json.Unmarshal([]byte(flowJSON), &flowData); err != nil {
		t.Fatalf("failed to unmarshal flow data: %v", err)
	}


	cmd := &model.Command{
		ID:         "cmd_1",
		AppID:      "app_123",
		Name:       "ping",
		Enabled:    true,
		FlowSource: flowData,
	}

	appStore := &mockAppStoreForInteractions{app: app}
	cmdStore := &mockCommandStoreForInteractions{commands: []*model.Command{cmd}}

	cfg := &config.Config{
		Server: config.ServerConfig{
			Port:          8080,
			PublicBaseURL: "http://localhost:8080",
		},
	}

	server := NewServer(cfg, nil, nil, appStore, cmdStore, nil, nil)

	// Helper to send signed requests
	sendSignedRequest := func(body []byte) *httptest.ResponseRecorder {
		timestamp := "1729068000"
		msg := append([]byte(timestamp), body...)
		sig := ed25519.Sign(priv, msg)
		sigHex := hex.EncodeToString(sig)

		req := httptest.NewRequest(http.MethodPost, "/v1/interactions/app_123", bytes.NewReader(body))
		req.Header.Set("X-Signature-Ed25519", sigHex)
		req.Header.Set("X-Signature-Timestamp", timestamp)
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		server.router.ServeHTTP(w, req)
		return w
	}

	t.Run("Ping Handshake", func(t *testing.T) {
		pingBody := []byte(`{"type":1}`)
		w := sendSignedRequest(pingBody)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for ping, got %d: %s", w.Code, w.Body.String())
		}
		if !bytes.Contains(w.Body.Bytes(), []byte(`{"type":1}`)) {
			t.Fatalf("expected pong response with type 1, got %s", w.Body.String())
		}
	})

	t.Run("Slash Command Execution", func(t *testing.T) {
		cmdBody := []byte(`{
			"id": "111222333",
			"type": 2,
			"data": {
				"id": "444555",
				"name": "ping",
				"type": 1
			},
			"token": "interaction_token_abc"
		}`)

		w := sendSignedRequest(cmdBody)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp["type"] != float64(4) {
			t.Errorf("expected interaction response type 4, got %v", resp["type"])
		}
		data, ok := resp["data"].(map[string]any)
		if !ok || data["content"] != "Pong from Serverless!" {
			t.Errorf("expected content 'Pong from Serverless!', got %v", resp["data"])
		}
	})

	t.Run("Invalid Signature Rejected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/interactions/app_123", bytes.NewReader([]byte(`{"type":1}`)))
		req.Header.Set("X-Signature-Ed25519", "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")
		req.Header.Set("X-Signature-Timestamp", "1729068000")

		w := httptest.NewRecorder()
		server.router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 Unauthorized for bad signature, got %d", w.Code)
		}
	})

	t.Run("Missing Headers Rejected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/interactions/app_123", bytes.NewReader([]byte(`{"type":1}`)))
		w := httptest.NewRecorder()
		server.router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 Unauthorized for missing headers, got %d", w.Code)
		}
	})
}
