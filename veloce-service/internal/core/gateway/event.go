package gateway

import (
	"context"
	"log/slog"
	"sync"

	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type EventHandler interface {
	HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event)
}

type EventRouter struct {
	mu       sync.RWMutex
	handlers []EventHandler
}

func NewEventRouter() *EventRouter {
	return &EventRouter{
		handlers: make([]EventHandler, 0),
	}
}

func (r *EventRouter) RegisterHandler(handler EventHandler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers = append(r.handlers, handler)
}

func (r *EventRouter) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	r.mu.RLock()
	handlers := append([]EventHandler(nil), r.handlers...)
	r.mu.RUnlock()

	for _, h := range handlers {
		go func(handler EventHandler) {
			defer func() {
				if rec := recover(); rec != nil {
					slog.Error("Recovered from panic in gateway event handler",
						slog.String("app_id", appID),
						slog.Any("panic", rec),
					)
				}
			}()
			handler.HandleEvent(ctx, appID, session, event)
		}(h)
	}
}

type LoggingEventHandler struct{}

func (h *LoggingEventHandler) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	switch e := event.(type) {
	case *gateway.ReadyEvent:
		slog.Info("Bot gateway ready",
			slog.String("app_id", appID),
			slog.String("bot_username", e.User.Username),
			slog.Int("guild_count", len(e.Guilds)),
		)
	case *gateway.InteractionCreateEvent:
		slog.Info("Discord interaction received",
			slog.String("app_id", appID),
			slog.String("interaction_id", e.ID.String()),
		)
	}
}
