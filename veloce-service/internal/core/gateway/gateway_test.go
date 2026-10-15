package gateway

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type mockHandler struct {
	mu     sync.Mutex
	events []gateway.Event
}

func (m *mockHandler) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
}

type panickingHandler struct{}

func (p *panickingHandler) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	panic("test panic in event handler")
}

func TestEventRouter(t *testing.T) {
	router := NewEventRouter()

	h1 := &mockHandler{}
	h2 := &mockHandler{}
	panicH := &panickingHandler{}

	router.RegisterHandler(h1)
	router.RegisterHandler(panicH)
	router.RegisterHandler(h2)

	readyEv := &gateway.ReadyEvent{
		Version: 10,
		User: discord.User{
			ID:       discord.UserID(12345),
			Username: "TestBot",
		},
	}

	router.HandleEvent(context.Background(), "app-123", nil, readyEv)

	// Handlers are executed concurrently in goroutines; wait briefly for completion
	time.Sleep(50 * time.Millisecond)

	h1.mu.Lock()
	defer h1.mu.Unlock()
	if len(h1.events) != 1 {
		t.Fatalf("expected handler 1 to receive 1 event, got %d", len(h1.events))
	}

	h2.mu.Lock()
	defer h2.mu.Unlock()
	if len(h2.events) != 1 {
		t.Fatalf("expected handler 2 to receive 1 event despite panic in other handler, got %d", len(h2.events))
	}
}

type mockAppStore struct {
	mu   sync.Mutex
	apps map[string]*model.App
}

func newMockAppStore() *mockAppStore {
	return &mockAppStore{
		apps: make(map[string]*model.App),
	}
}

func (m *mockAppStore) ListActiveApps(ctx context.Context, clusterCount, clusterIndex int) ([]*model.App, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var result []*model.App
	for _, app := range m.apps {
		if app.Enabled {
			result = append(result, app)
		}
	}
	return result, nil
}

func (m *mockAppStore) GetAppByID(ctx context.Context, id string) (*model.App, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if app, ok := m.apps[id]; ok {
		return app, nil
	}
	return nil, nil
}

func (m *mockAppStore) GetAppByDiscordID(ctx context.Context, discordID string) (*model.App, error) {
	return nil, nil
}

func (m *mockAppStore) ListAppsByOwner(ctx context.Context, ownerUserID string) ([]*model.App, error) {
	return nil, nil
}

func (m *mockAppStore) CreateApp(ctx context.Context, app *model.App) (*model.App, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.apps[app.ID] = app
	return app, nil
}

func (m *mockAppStore) UpdateApp(ctx context.Context, app *model.App) (*model.App, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.apps[app.ID] = app
	return app, nil
}

func (m *mockAppStore) UpdateAppToken(ctx context.Context, appID string, encryptedToken string) error {
	return nil
}

func (m *mockAppStore) DeleteApp(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.apps, id)
	return nil
}

func (m *mockAppStore) QueueAppCommandsDeploy(ctx context.Context, appID string, force bool) error {
	return nil
}

func (m *mockAppStore) AppIDsWithDueCommandsDeploy(ctx context.Context, limit int) ([]string, error) {
	return nil, nil
}

func (m *mockAppStore) UpdateCommandsDeployResult(ctx context.Context, appID string, hash string, deployError *string) error {
	return nil
}

func TestGatewayManagerReconcile(t *testing.T) {
	crypt, err := util.NewSymmetricCrypt("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("failed to create crypt: %v", err)
	}

	encryptedToken, err := crypt.EncryptString("dummy-test-token")
	if err != nil {
		t.Fatalf("failed to encrypt token: %v", err)
	}

	store := newMockAppStore()
	app1 := &model.App{
		ID:           "app-1",
		Name:         "Bot One",
		Enabled:      true,
		DiscordToken: encryptedToken,
	}
	app2 := &model.App{
		ID:           "app-2",
		Name:         "Bot Two",
		Enabled:      true,
		DiscordToken: encryptedToken,
	}
	_, _ = store.CreateApp(context.Background(), app1)
	_, _ = store.CreateApp(context.Background(), app2)

	mgr := NewGatewayManager(store, crypt, NewEventRouter(), GatewayManagerConfig{
		ClusterCount: 1,
		ClusterIndex: 0,
		PollInterval: 1 * time.Second,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initial Reconcile
	if err := mgr.Reconcile(ctx); err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	if mgr.ActiveCount() != 2 {
		t.Fatalf("expected 2 active connections, got %d", mgr.ActiveCount())
	}

	conn, exists := mgr.GetConnection("app-1")
	if !exists || conn == nil {
		t.Fatal("expected connection for app-1 to exist")
	}
	if conn.App().Name != "Bot One" {
		t.Fatalf("expected app name Bot One, got %s", conn.App().Name)
	}

	// Disable app-2 and reconcile
	app2.Enabled = false
	_, _ = store.UpdateApp(context.Background(), app2)

	if err := mgr.Reconcile(ctx); err != nil {
		t.Fatalf("second reconcile failed: %v", err)
	}

	if mgr.ActiveCount() != 1 {
		t.Fatalf("expected 1 active connection after disabling app-2, got %d", mgr.ActiveCount())
	}

	_, exists2 := mgr.GetConnection("app-2")
	if exists2 {
		t.Fatal("expected app-2 connection to be removed")
	}

	// Stop all
	mgr.StopAll()
	if mgr.ActiveCount() != 0 {
		t.Fatalf("expected 0 active connections after StopAll, got %d", mgr.ActiveCount())
	}
}

func TestBotConnectionTokenError(t *testing.T) {
	crypt, err := util.NewSymmetricCrypt("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("failed to create crypt: %v", err)
	}

	app := &model.App{
		ID:           "app-invalid-token",
		Name:         "Bad Token Bot",
		DiscordToken: "not-valid-hex-or-ciphertext",
	}

	conn := NewBotConnection(app, crypt, nil)
	err = conn.Start(context.Background())
	if err == nil {
		t.Fatal("expected error decrypting invalid token, got nil")
	}
}
