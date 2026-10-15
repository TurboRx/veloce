package store

import (
	"context"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type SessionStore interface {
	CreateSession(ctx context.Context, userID string, duration time.Duration) (rawKey string, err error)
	GetSessionByKey(ctx context.Context, rawKey string) (*model.Session, *model.User, error)
	DeleteSession(ctx context.Context, rawKey string) error
	DeleteExpiredSessions(ctx context.Context) error
}
