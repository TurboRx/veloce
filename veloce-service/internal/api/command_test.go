package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
)

type mockCommandStore struct {
	mu       sync.Mutex
	commands map[string]*model.Command
}

func newMockCommandStore() *mockCommandStore {
	return &mockCommandStore{
		commands: make(map[string]*model.Command),
	}
}

func (m *mockCommandStore) CreateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cmd.ID == "" {
		cmd.ID = "cmd_" + cmd.Name
	}
	m.commands[cmd.ID] = cmd
	return cmd, nil
}

func (m *mockCommandStore) GetCommandByID(ctx context.Context, id string) (*model.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.commands[id], nil
}

func (m *mockCommandStore) ListCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var list []*model.Command
	for _, c := range m.commands {
		if c.AppID == appID {
			list = append(list, c)
		}
	}
	return list, nil
}

func (m *mockCommandStore) ListEnabledCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var list []*model.Command
	for _, c := range m.commands {
		if c.AppID == appID && c.Enabled {
			list = append(list, c)
		}
	}
	return list, nil
}

func (m *mockCommandStore) UpdateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.commands[cmd.ID] = cmd
	return cmd, nil
}

func (m *mockCommandStore) DeleteCommand(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.commands, id)
	return nil
}

func (m *mockCommandStore) UpdateLastDeployed(ctx context.Context, commandIDs []string) error {
	return nil
}

func TestCommandEndpoints(t *testing.T) {
	cfg := &config.Config{Server: config.ServerConfig{Port: 8080}}
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	crypt, _ := util.NewSymmetricCrypt(key)

	appStore := &mockAppStore{apps: make(map[string]*model.App)}
	cmdStore := newMockCommandStore()
	server := NewServer(cfg, nil, nil, appStore, cmdStore, crypt, &mockBotVerifier{})

	user := &model.User{ID: "usr_owner_1"}
	app := &model.App{
		ID:          "app_1",
		Name:        "TestBot",
		OwnerUserID: "usr_owner_1",
		Enabled:     true,
	}
	_, _ = appStore.CreateApp(context.Background(), app)

	// Valid command flow data
	validFlow := flow.FlowData{
		Nodes: []flow.FlowNode{
			{
				ID:   "entry",
				Type: flow.FlowNodeTypeEntryCommand,
				Data: flow.FlowNodeData{
					Name:        "echo",
					Description: "Echo back user input",
				},
			},
			{
				ID:   "reply",
				Type: flow.FlowNodeTypeActionResponseCreate,
				Data: flow.FlowNodeData{
					ResponseContent: "Hello World!",
				},
			},
		},
		Edges: []flow.FlowEdge{
			{ID: "e1", Source: "entry", Target: "reply"},
		},
	}

	// 1. Create Command
	createReq := CreateCommandRequest{
		Name:        "echo",
		Description: "Echo back user input",
		FlowSource:  validFlow,
	}
	body, _ := json.Marshal(createReq)

	req := httptest.NewRequest(http.MethodPost, "/v1/apps/app_1/commands", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec := httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var created model.Command
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.Name != "echo" {
		t.Fatalf("expected command name echo, got %s", created.Name)
	}

	// 2. List Commands
	reqList := httptest.NewRequest(http.MethodGet, "/v1/apps/app_1/commands", nil)
	reqList = reqList.WithContext(context.WithValue(reqList.Context(), UserContextKey, user))
	recList := httptest.NewRecorder()
	server.router.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recList.Code)
	}

	var commands []*model.Command
	_ = json.Unmarshal(recList.Body.Bytes(), &commands)
	if len(commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(commands))
	}

	// 3. Get Command
	reqGet := httptest.NewRequest(http.MethodGet, "/v1/apps/app_1/commands/"+created.ID, nil)
	reqGet = reqGet.WithContext(context.WithValue(reqGet.Context(), UserContextKey, user))
	recGet := httptest.NewRecorder()
	server.router.ServeHTTP(recGet, reqGet)

	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recGet.Code)
	}

	// 4. Update Command
	newDesc := "Updated Description"
	updateReq := UpdateCommandRequest{Description: &newDesc}
	upBody, _ := json.Marshal(updateReq)
	reqUp := httptest.NewRequest(http.MethodPatch, "/v1/apps/app_1/commands/"+created.ID, bytes.NewReader(upBody))
	reqUp = reqUp.WithContext(context.WithValue(reqUp.Context(), UserContextKey, user))
	recUp := httptest.NewRecorder()
	server.router.ServeHTTP(recUp, reqUp)

	if recUp.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on update, got %d", recUp.Code)
	}

	// 5. Deploy Command
	reqDeploy := httptest.NewRequest(http.MethodPost, "/v1/apps/app_1/commands/deploy", nil)
	reqDeploy = reqDeploy.WithContext(context.WithValue(reqDeploy.Context(), UserContextKey, user))
	recDeploy := httptest.NewRecorder()
	server.router.ServeHTTP(recDeploy, reqDeploy)

	if recDeploy.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on deploy, got %d", recDeploy.Code)
	}

	// 6. Delete Command
	reqDel := httptest.NewRequest(http.MethodDelete, "/v1/apps/app_1/commands/"+created.ID, nil)
	reqDel = reqDel.WithContext(context.WithValue(reqDel.Context(), UserContextKey, user))
	recDel := httptest.NewRecorder()
	server.router.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on delete, got %d", recDel.Code)
	}
}
