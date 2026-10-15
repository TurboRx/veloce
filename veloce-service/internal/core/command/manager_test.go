package command

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/api"
)

type mockAppStore struct {
	apps     map[string]*model.App
	dueApps  []string
	lastHash string
}

func (m *mockAppStore) CreateApp(ctx context.Context, app *model.App) (*model.App, error) {
	m.apps[app.ID] = app
	return app, nil
}
func (m *mockAppStore) GetAppByID(ctx context.Context, id string) (*model.App, error) {
	return m.apps[id], nil
}
func (m *mockAppStore) GetAppByDiscordID(ctx context.Context, discordID string) (*model.App, error) {
	return nil, nil
}
func (m *mockAppStore) ListAppsByOwner(ctx context.Context, ownerUserID string) ([]*model.App, error) {
	return nil, nil
}
func (m *mockAppStore) UpdateApp(ctx context.Context, app *model.App) (*model.App, error) {
	m.apps[app.ID] = app
	return app, nil
}
func (m *mockAppStore) UpdateAppToken(ctx context.Context, appID string, encryptedToken string) error {
	return nil
}
func (m *mockAppStore) DeleteApp(ctx context.Context, id string) error {
	return nil
}
func (m *mockAppStore) QueueAppCommandsDeploy(ctx context.Context, appID string, force bool) error {
	return nil
}
func (m *mockAppStore) ListActiveApps(ctx context.Context, clusterCount, clusterIndex int) ([]*model.App, error) {
	return nil, nil
}
func (m *mockAppStore) AppIDsWithDueCommandsDeploy(ctx context.Context, limit int) ([]string, error) {
	return m.dueApps, nil
}
func (m *mockAppStore) UpdateCommandsDeployResult(ctx context.Context, appID string, hash string, deployError *string) error {
	m.lastHash = hash
	return nil
}

type mockCmdStore struct {
	commands map[string]*model.Command
}

func (m *mockCmdStore) CreateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	m.commands[cmd.ID] = cmd
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

func TestCommandManagerUnchangedHashSkip(t *testing.T) {
	appStore := &mockAppStore{
		apps:    make(map[string]*model.App),
		dueApps: []string{"app_test"},
	}
	cmdStore := &mockCmdStore{
		commands: make(map[string]*model.Command),
	}

	validFlow := flow.FlowData{
		Nodes: []flow.FlowNode{
			{
				ID:   "entry",
				Type: flow.FlowNodeTypeEntryCommand,
				Data: flow.FlowNodeData{Name: "status", Description: "Bot status"},
			},
		},
	}

	cmdStore.commands["cmd_status"] = &model.Command{
		ID:         "cmd_status",
		Name:       "status",
		AppID:      "app_test",
		Enabled:    true,
		FlowSource: validFlow,
	}

	// Pre-calculate hash of the command
	compiled, _ := flow.CompileCommand(validFlow)
	discordCmds := []api.CreateCommandData{compiled.CommandData()}
	hashBytes, _ := json.Marshal(discordCmds)
	h := sha256.Sum256(hashBytes)
	knownHash := hex.EncodeToString(h[:])

	deployAt := time.Now()
	appStore.apps["app_test"] = &model.App{
		ID:                   "app_test",
		DiscordID:            "1234567890",
		DiscordToken:         "dummy_encrypted_token",
		Enabled:              true,
		CommandsDeployAt:     &deployAt,
		CommandsDeployedHash: &knownHash,
	}

	crypt, _ := util.NewSymmetricCrypt("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	mgr := NewCommandManager(appStore, cmdStore, nil, crypt)

	// Since hash matches, DeployAppCommands should update result without contacting Discord
	err := mgr.DeployAppCommands(context.Background(), "app_test")
	if err != nil {
		t.Fatalf("expected no error on hash match skip, got %v", err)
	}

	if appStore.lastHash != knownHash {
		t.Fatalf("expected lastHash %s, got %s", knownHash, appStore.lastHash)
	}
}
