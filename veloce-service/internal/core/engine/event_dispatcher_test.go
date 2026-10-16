package engine

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
)

type mockEventListenerStore struct {
	mu        sync.Mutex
	listeners map[string]*model.EventListener
	lastRuns  map[string]time.Time
}

func newMockEventListenerStore() *mockEventListenerStore {
	return &mockEventListenerStore{
		listeners: make(map[string]*model.EventListener),
		lastRuns:  make(map[string]time.Time),
	}
}

func (m *mockEventListenerStore) CreateEventListener(ctx context.Context, l *model.EventListener) (*model.EventListener, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
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
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastRuns[id] = time.Now()
	return nil
}

func TestEventDispatcherMessageCreate(t *testing.T) {
	lStore := newMockEventListenerStore()
	logStore := &mockLogStore{}

	flowData := flow.FlowData{
		Nodes: []flow.FlowNode{
			{
				ID:   "entry",
				Type: flow.FlowNodeTypeEntryEvent,
				Data: flow.FlowNodeData{
					Name:        "on_message",
					Description: "Log incoming message",
					EventType:   "message_create",
				},
			},
			{
				ID:   "var_set",
				Type: flow.FlowNodeTypeActionVariableSet,
				Data: flow.FlowNodeData{
					VariableName:  "last_author",
					VariableValue: "{{user.username}}",
				},
			},
		},
		Edges: []flow.FlowEdge{
			{ID: "e1", Source: "entry", Target: "var_set"},
		},
	}

	lStore.listeners["listener-1"] = &model.EventListener{
		ID:         "listener-1",
		Source:     model.EventSourceDiscord,
		Type:       model.EventListenerTypeDiscordMessageCreate,
		AppID:      "app_123",
		Enabled:    true,
		FlowSource: flowData,
	}

	dispatcher := NewEventDispatcher(lStore, logStore)

	event := &gateway.MessageCreateEvent{
		Message: discord.Message{
			ID:        discord.MessageID(111),
			ChannelID: discord.ChannelID(222),
			Content:   "Hello Veloce",
			Author: discord.User{
				ID:       discord.UserID(333),
				Username: "DiscordUser",
				Bot:      false,
			},
		},
	}

	dispatcher.HandleEvent(context.Background(), "app_123", nil, event)

	// Wait briefly for asynchronous execution
	time.Sleep(100 * time.Millisecond)

	lStore.mu.Lock()
	_, updated := lStore.lastRuns["listener-1"]
	lStore.mu.Unlock()

	if !updated {
		t.Fatal("expected UpdateLastRun to be called for listener-1")
	}

	logStore.mu.Lock()
	defer logStore.mu.Unlock()
	if len(logStore.logs) == 0 {
		t.Fatal("expected execution log to be recorded")
	}
	if logStore.logs[0].Level != model.LogLevelInfo {
		t.Fatalf("expected info log level, got %s", logStore.logs[0].Level)
	}
}

func TestEventDispatcherFilters(t *testing.T) {
	lStore := newMockEventListenerStore()
	logStore := &mockLogStore{}

	ignoreBotsTrue := true
	flowData := flow.FlowData{
		Nodes: []flow.FlowNode{
			{ID: "entry", Type: flow.FlowNodeTypeEntryEvent},
		},
	}

	lStore.listeners["channel-filtered"] = &model.EventListener{
		ID:      "channel-filtered",
		Source:  model.EventSourceDiscord,
		Type:    model.EventListenerTypeDiscordMessageCreate,
		AppID:   "app_123",
		Enabled: true,
		Filter: &model.EventListenerFilter{
			Channels:   []string{"999"},
			IgnoreBots: &ignoreBotsTrue,
		},
		FlowSource: flowData,
	}

	dispatcher := NewEventDispatcher(lStore, logStore)

	// Message in channel 555 (does not match 999)
	eventWrongChannel := &gateway.MessageCreateEvent{
		Message: discord.Message{
			ChannelID: discord.ChannelID(555),
			Author:    discord.User{ID: 1, Bot: false},
		},
	}
	dispatcher.HandleEvent(context.Background(), "app_123", nil, eventWrongChannel)
	time.Sleep(50 * time.Millisecond)

	lStore.mu.Lock()
	_, updated := lStore.lastRuns["channel-filtered"]
	lStore.mu.Unlock()
	if updated {
		t.Fatal("expected channel-filtered listener NOT to run for channel 555")
	}

	// Message by a bot should be ignored
	eventBot := &gateway.MessageCreateEvent{
		Message: discord.Message{
			ChannelID: discord.ChannelID(999),
			Author:    discord.User{ID: 2, Bot: true},
		},
	}
	dispatcher.HandleEvent(context.Background(), "app_123", nil, eventBot)
	time.Sleep(50 * time.Millisecond)

	lStore.mu.Lock()
	_, updatedBot := lStore.lastRuns["channel-filtered"]
	lStore.mu.Unlock()
	if updatedBot {
		t.Fatal("expected bot message to be ignored")
	}
}
