package gateway

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/store"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/state"
)

type GatewayManagerConfig struct {
	ClusterCount int
	ClusterIndex int
	PollInterval time.Duration
}

type GatewayManager struct {
	mu           sync.RWMutex
	config       GatewayManagerConfig
	appStore     store.AppStore
	tokenCrypt   *util.SymmetricCrypt
	eventHandler EventHandler
	connections  map[string]*BotConnection
}

func NewGatewayManager(
	appStore store.AppStore,
	tokenCrypt *util.SymmetricCrypt,
	eventHandler EventHandler,
	config GatewayManagerConfig,
) *GatewayManager {
	if config.ClusterCount <= 0 {
		config.ClusterCount = 1
	}
	if config.ClusterIndex < 0 {
		config.ClusterIndex = 0
	}
	if config.PollInterval <= 0 {
		config.PollInterval = 10 * time.Second
	}

	return &GatewayManager{
		config:       config,
		appStore:     appStore,
		tokenCrypt:   tokenCrypt,
		eventHandler: eventHandler,
		connections:  make(map[string]*BotConnection),
	}
}

// Run starts the background polling loop for active apps.
func (m *GatewayManager) Run(ctx context.Context) {
	slog.Info("Starting Discord Gateway Manager",
		slog.Int("cluster_count", m.config.ClusterCount),
		slog.Int("cluster_index", m.config.ClusterIndex),
		slog.Duration("poll_interval", m.config.PollInterval),
	)

	// Initial reconciliation
	if err := m.Reconcile(ctx); err != nil {
		slog.Error("Initial gateway reconciliation failed", slog.String("error", err.Error()))
	}

	ticker := time.NewTicker(m.config.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("Shutting down Discord Gateway Manager")
			m.StopAll()
			return
		case <-ticker.C:
			if err := m.Reconcile(ctx); err != nil {
				slog.Error("Gateway reconciliation error", slog.String("error", err.Error()))
			}
		}
	}
}

// Reconcile synchronizes running connections with active apps from the store.
func (m *GatewayManager) Reconcile(ctx context.Context) error {
	if m.appStore == nil || m.tokenCrypt == nil {
		return nil
	}

	apps, err := m.appStore.ListActiveApps(ctx, m.config.ClusterCount, m.config.ClusterIndex)
	if err != nil {
		return fmt.Errorf("failed to list active apps: %w", err)
	}

	activeAppMap := make(map[string]*model.App, len(apps))
	for _, app := range apps {
		activeAppMap[app.ID] = app
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// 1. Remove deleted or disabled apps
	for appID, conn := range m.connections {
		if _, stillActive := activeAppMap[appID]; !stillActive {
			slog.Info("Stopping gateway for inactive app", slog.String("app_id", appID))
			go func(c *BotConnection) {
				_ = c.Stop()
			}(conn)
			delete(m.connections, appID)
		}
	}

	// 2. Add new apps or update existing ones
	for appID, app := range activeAppMap {
		if conn, exists := m.connections[appID]; exists {
			_ = conn.UpdateApp(ctx, app)
		} else {
			slog.Info("Starting new bot gateway connection",
				slog.String("app_id", app.ID),
				slog.String("bot_name", app.Name),
			)
			conn := NewBotConnection(app, m.tokenCrypt, m.eventHandler)
			if err := conn.Start(ctx); err != nil {
				slog.Error("Failed to start bot connection",
					slog.String("app_id", app.ID),
					slog.String("error", err.Error()),
				)
				continue
			}
			m.connections[appID] = conn
		}
	}

	return nil
}

// GetConnection returns the active connection for an app ID.
func (m *GatewayManager) GetConnection(appID string) (*BotConnection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[appID]
	return conn, ok
}

// AppSession returns the arikawa state session for a running app.
func (m *GatewayManager) AppSession(appID string) (*state.State, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[appID]
	if !ok || conn.Session() == nil {
		return nil, fmt.Errorf("gateway connection not found or inactive for app %s", appID)
	}
	return conn.Session(), nil
}

// ActiveCount returns the number of managed connections.
func (m *GatewayManager) ActiveCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.connections)
}

// StopAll stops all active connections.
func (m *GatewayManager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for appID, conn := range m.connections {
		slog.Info("Stopping bot gateway connection", slog.String("app_id", appID))
		_ = conn.Stop()
	}
	clear(m.connections)
}

type GatewayAppStatus struct {
	Connected  bool      `json:"connected"`
	LastPingAt time.Time `json:"last_ping_at,omitempty"`
	GuildCount int       `json:"guild_count"`
}

// GetAppStatus returns live gateway telemetry for an app.
func (m *GatewayManager) GetAppStatus(appID string) GatewayAppStatus {
	m.mu.RLock()
	conn, ok := m.connections[appID]
	m.mu.RUnlock()

	if !ok || !conn.IsConnected() {
		return GatewayAppStatus{Connected: false, GuildCount: 0}
	}

	guilds, _ := conn.Guilds()
	return GatewayAppStatus{
		Connected:  true,
		LastPingAt: conn.LastPingAt(),
		GuildCount: len(guilds),
	}
}

// ListGuilds returns the cached guilds for an active app session.
func (m *GatewayManager) ListGuilds(appID string) ([]discord.Guild, error) {
	m.mu.RLock()
	conn, ok := m.connections[appID]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("no gateway connection for app %s", appID)
	}

	return conn.Guilds()
}

