package store

import (
	"context"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type CommandStore interface {
	CreateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error)
	GetCommandByID(ctx context.Context, id string) (*model.Command, error)
	ListCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error)
	ListEnabledCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error)
	UpdateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error)
	DeleteCommand(ctx context.Context, id string) error
	UpdateLastDeployed(ctx context.Context, commandIDs []string) error
}
