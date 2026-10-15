package store

import (
	"context"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type AppStore interface {
	CreateApp(ctx context.Context, app *model.App) (*model.App, error)
	GetAppByID(ctx context.Context, id string) (*model.App, error)
	GetAppByDiscordID(ctx context.Context, discordID string) (*model.App, error)
	ListAppsByOwner(ctx context.Context, ownerUserID string) ([]*model.App, error)
	UpdateApp(ctx context.Context, app *model.App) (*model.App, error)
	UpdateAppToken(ctx context.Context, appID string, encryptedToken string) error
	DeleteApp(ctx context.Context, id string) error
	QueueAppCommandsDeploy(ctx context.Context, appID string, force bool) error
}
