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

type mockEventListenerStore struct {
	mu        sync.Mutex
	listeners map[string]*model.EventListener
}

func newMockEventListenerStore() *mockEventListenerStore {
	return &mockEventListenerStore{
		listeners: make(map[string]*model.EventListener),
	}
}

func (m *mockEventListenerStore) CreateEventListener(ctx context.Context, l *model.EventListener) (*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if l.ID == "" {
		l.ID = "event_" + string(l.Type)
	}
	m.listeners[l.ID] = l
	return l, nil
}

func (m *mockEventListenerStore) GetEventListenerByID(ctx context.Context, id string) (*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.listeners[id], nil
}

func (m *mockEventListenerStore) ListEventListenersByApp(ctx context.Context, appID string) ([]*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var list []*model.EventListener
	for _, l := range m.listeners {
		if l.AppID == appID {
			list = append(list, l)
		}
	}
	return list, nil
}

func (m *mockEventListenerStore) ListEnabledEventListenersByApp(ctx context.Context, appID string) ([]*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var list []*model.EventListener
	for _, l := range m.listeners {
		if l.AppID == appID && l.Enabled {
			list = append(list, l)
		}
	}
	return list, nil
}

func (m *mockEventListenerStore) ListEnabledEventListenersByAppAndType(
	ctx context.Context,
	appID string,
	eventType model.EventListenerType,
) ([]*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var list []*model.EventListener
	for _, l := range m.listeners {
		if l.AppID == appID && l.Enabled && l.Type == eventType {
			list = append(list, l)
		}
	}
	return list, nil
}

func (m *mockEventListenerStore) UpdateEventListener(ctx context.Context, l *model.EventListener) (*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.listeners[l.ID] = l
	return l, nil
}

func (m *mockEventListenerStore) DeleteEventListener(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.listeners, id)
	return nil
}

func (m *mockEventListenerStore) UpdateLastRun(ctx context.Context, id string) error {
	return nil
}

func TestEventListenerEndpoints(t *testing.T) {
	cfg := &config.Config{Server: config.ServerConfig{Port: 8080}}
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	crypt, _ := util.NewSymmetricCrypt(key)

	appStore := &mockAppStore{apps: make(map[string]*model.App)}
	cmdStore := newMockCommandStore()
	eventStore := newMockEventListenerStore()

	server := NewServer(cfg, nil, nil, appStore, cmdStore, crypt, &mockBotVerifier{})
	server.SetEventListenerStore(eventStore)

	user := &model.User{ID: "usr_owner_1"}
	app := &model.App{
		ID:          "app_1",
		Name:        "TestBot",
		OwnerUserID: "usr_owner_1",
	}
	appStore.apps["app_1"] = app

	validFlow := flow.FlowData{
		Nodes: []flow.FlowNode{
			{
				ID:   "entry",
				Type: flow.FlowNodeTypeEntryEvent,
				Data: flow.FlowNodeData{
					Name:      "welcome",
					EventType: "guild_member_add",
				},
			},
			{
				ID:   "msg",
				Type: flow.FlowNodeTypeActionMessageCreate,
				Data: flow.FlowNodeData{
					MessageContent: "Welcome to server!",
				},
			},
		},
		Edges: []flow.FlowEdge{
			{ID: "e1", Source: "entry", Target: "msg"},
		},
	}

	// 1. Create Event Listener
	createReq := CreateEventListenerRequest{
		Source:      model.EventSourceDiscord,
		Type:        model.EventListenerTypeDiscordGuildMemberAdd,
		Description: "Welcome new members",
		FlowSource:  validFlow,
	}
	body, _ := json.Marshal(createReq)
	req := httptest.NewRequest(http.MethodPost, "/v1/apps/app_1/events", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec := httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var created model.EventListener
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode created listener: %v", err)
	}
	if created.Type != model.EventListenerTypeDiscordGuildMemberAdd {
		t.Fatalf("expected type guild_member_add, got %s", created.Type)
	}

	// 2. List Event Listeners
	req = httptest.NewRequest(http.MethodGet, "/v1/apps/app_1/events", nil)
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec = httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	var list []*model.EventListener
	_ = json.NewDecoder(rec.Body).Decode(&list)
	if len(list) != 1 {
		t.Fatalf("expected 1 event listener, got %d", len(list))
	}

	// 3. Get Event Listener
	req = httptest.NewRequest(http.MethodGet, "/v1/apps/app_1/events/"+created.ID, nil)
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec = httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	// 4. Update Event Listener
	newDesc := "Updated welcome flow"
	updateReq := UpdateEventListenerRequest{
		Description: &newDesc,
	}
	updateBody, _ := json.Marshal(updateReq)
	req = httptest.NewRequest(http.MethodPatch, "/v1/apps/app_1/events/"+created.ID, bytes.NewReader(updateBody))
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec = httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on update, got %d: %s", rec.Code, rec.Body.String())
	}
	var updated model.EventListener
	_ = json.NewDecoder(rec.Body).Decode(&updated)
	if updated.Description != newDesc {
		t.Fatalf("expected description '%s', got '%s'", newDesc, updated.Description)
	}

	// 5. Delete Event Listener
	req = httptest.NewRequest(http.MethodDelete, "/v1/apps/app_1/events/"+created.ID, nil)
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec = httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on delete, got %d", rec.Code)
	}

	// Verify deletion
	req = httptest.NewRequest(http.MethodGet, "/v1/apps/app_1/events/"+created.ID, nil)
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, user))
	rec = httptest.NewRecorder()
	server.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found after delete, got %d", rec.Code)
	}
}
