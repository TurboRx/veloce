package gateway

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type BotConnection struct {
	mu           sync.RWMutex
	app          *model.App
	tokenCrypt   *util.SymmetricCrypt
	eventHandler EventHandler
	session      *state.State
	cancelCtx    context.CancelFunc
	connected    atomic.Bool
	lastPing     atomic.Int64
}

func NewBotConnection(
	app *model.App,
	tokenCrypt *util.SymmetricCrypt,
	eventHandler EventHandler,
) *BotConnection {
	return &BotConnection{
		app:          app,
		tokenCrypt:   tokenCrypt,
		eventHandler: eventHandler,
	}
}

func (b *BotConnection) Start(parentCtx context.Context) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.connected.Load() {
		return nil
	}

	rawToken, err := b.tokenCrypt.DecryptString(b.app.DiscordToken)
	if err != nil {
		return fmt.Errorf("failed to decrypt bot token for app %s: %w", b.app.ID, err)
	}

	ctx, cancel := context.WithCancel(parentCtx)
	b.cancelCtx = cancel

	// Create Arikawa state session
	s := state.New("Bot " + rawToken)

	// Standard default intents for receiving guild interactions and slash commands
	s.AddIntents(gateway.IntentGuilds)

	// Register event listener
	s.AddHandler(func(e gateway.Event) {
		switch e.(type) {
		case *gateway.ReadyEvent:
			b.connected.Store(true)
			b.lastPing.Store(time.Now().Unix())
		case *gateway.HeartbeatAckEvent:
			b.lastPing.Store(time.Now().Unix())
		}

		if b.eventHandler != nil {
			b.eventHandler.HandleEvent(ctx, b.app.ID, s, e)
		}
	})

	b.session = s

	// Connect in background goroutine with exponential backoff on disconnect
	go func() {
		defer b.connected.Store(false)

		for ctx.Err() == nil {
			slog.Info("Connecting bot gateway",
				slog.String("app_id", b.app.ID),
				slog.String("bot_name", b.app.Name),
			)

			err := s.Open(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				slog.Error("Bot gateway connection error, retrying in 5s",
					slog.String("app_id", b.app.ID),
					slog.String("error", err.Error()),
				)
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
				}
			}
		}
	}()

	return nil
}

func (b *BotConnection) Stop() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.cancelCtx != nil {
		b.cancelCtx()
		b.cancelCtx = nil
	}

	if b.session != nil {
		err := b.session.Close()
		b.session = nil
		b.connected.Store(false)
		return err
	}

	return nil
}

func (b *BotConnection) IsConnected() bool {
	return b.connected.Load()
}

func (b *BotConnection) App() *model.App {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.app
}

func (b *BotConnection) Session() *state.State {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.session
}

func (b *BotConnection) UpdateApp(ctx context.Context, app *model.App) error {
	b.mu.Lock()
	oldToken := b.app.DiscordToken
	b.app = app
	tokenChanged := oldToken != app.DiscordToken
	b.mu.Unlock()

	if tokenChanged {
		slog.Info("Bot token changed, restarting gateway session", slog.String("app_id", app.ID))
		_ = b.Stop()
		return b.Start(ctx)
	}

	return nil
}
