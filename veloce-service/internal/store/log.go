package store

import (
	"context"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type LogStore interface {
	CreateLog(ctx context.Context, log *model.Log) (*model.Log, error)
	ListLogsByApp(ctx context.Context, appID string, limit, offset int) ([]*model.Log, error)
	DeleteOldLogs(ctx context.Context, olderThan time.Time) error
}
