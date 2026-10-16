package store

import (
	"context"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type EventListenerStore interface {
	CreateEventListener(ctx context.Context, listener *model.EventListener) (*model.EventListener, error)
	GetEventListenerByID(ctx context.Context, id string) (*model.EventListener, error)
	ListEventListenersByApp(ctx context.Context, appID string) ([]*model.EventListener, error)
	ListEnabledEventListenersByApp(ctx context.Context, appID string) ([]*model.EventListener, error)
	ListEnabledEventListenersByAppAndType(ctx context.Context, appID string, eventType model.EventListenerType) ([]*model.EventListener, error)
	UpdateEventListener(ctx context.Context, listener *model.EventListener) (*model.EventListener, error)
	DeleteEventListener(ctx context.Context, id string) error
	UpdateLastRun(ctx context.Context, id string) error
}
