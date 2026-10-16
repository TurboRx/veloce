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

type mockCmdStore struct {
	commands map[string]*model.Command
}

func (m *mockCmdStore) CreateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	return cmd, nil
}
func (m *mockCmdStore) GetCommandByID(ctx context.Context, id string) (*model.Command, error) {
	return m.commands[id], nil
}
func (m *mockCmdStore) ListCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	return nil, nil
}
func (m *mockCmdStore) ListEnabledCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	var list []*model.Command
	for _, c := range m.commands {
		if c.AppID == appID && c.Enabled {
			list = append(list, c)
		}
	}
	return list, nil
}
func (m *mockCmdStore) UpdateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	return cmd, nil
}
func (m *mockCmdStore) DeleteCommand(ctx context.Context, id string) error {
	return nil
}
func (m *mockCmdStore) UpdateLastDeployed(ctx context.Context, commandIDs []string) error {
	return nil
}

type mockLogStore struct {
	mu   sync.Mutex
	logs []*model.Log
}

func (m *mockLogStore) CreateLog(ctx context.Context, log *model.Log) (*model.Log, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logs = append(m.logs, log)
	return log, nil
}

func (m *mockLogStore) ListLogsByApp(ctx context.Context, appID string, limit, offset int) ([]*model.Log, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.logs, nil
}

func (m *mockLogStore) DeleteOldLogs(ctx context.Context, olderThan time.Time) error {
	return nil
}

func TestInteractionDispatcherMatchingCommand(t *testing.T) {
	store := &mockCmdStore{
		commands: make(map[string]*model.Command),
	}

	validFlow := flow.FlowData{
		Nodes: []flow.FlowNode{
			{
				ID:   "entry",
				Type: flow.FlowNodeTypeEntryCommand,
				Data: flow.FlowNodeData{Name: "help"},
			},
			{
				ID:   "resp",
				Type: flow.FlowNodeTypeActionResponseCreate,
				Data: flow.FlowNodeData{ResponseContent: "Help message for {{user.username}}"},
			},
		},
		Edges: []flow.FlowEdge{
			{ID: "e1", Source: "entry", Target: "resp"},
		},
	}

	store.commands["cmd_help"] = &model.Command{
		ID:         "cmd_help",
		Name:       "help",
		AppID:      "app_xyz",
		Enabled:    true,
		FlowSource: validFlow,
	}

	logStore := &mockLogStore{}
	dispatcher := NewInteractionDispatcher(store, logStore)

	ev := &gateway.InteractionCreateEvent{
		InteractionEvent: discord.InteractionEvent{
			ID:        discord.InteractionID(999),
			AppID:     discord.AppID(111),
			GuildID:   discord.GuildID(777),
			ChannelID: discord.ChannelID(666),
			Token:     "dummy_token",
			User: &discord.User{
				ID:       discord.UserID(888),
				Username: "Tester",
			},
			Data: &discord.CommandInteraction{
				Name: "help",
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	dispatcher.HandleEvent(ctx, "app_xyz", nil, ev)

	// Wait briefly for the async log write
	time.Sleep(100 * time.Millisecond)

	logStore.mu.Lock()
	defer logStore.mu.Unlock()
	if len(logStore.logs) != 1 {
		t.Fatalf("expected 1 log recorded, got %d", len(logStore.logs))
	}

	recorded := logStore.logs[0]
	if recorded.Level != model.LogLevelInfo {
		t.Errorf("expected LogLevelInfo, got %s", recorded.Level)
	}
	if recorded.AppID != "app_xyz" {
		t.Errorf("expected app_xyz, got %s", recorded.AppID)
	}
	if recorded.Details["command_name"] != "help" {
		t.Errorf("expected command_name help, got %v", recorded.Details["command_name"])
	}
}
