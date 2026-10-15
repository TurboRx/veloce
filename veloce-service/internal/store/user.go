package store

import (
	"context"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type UserStore interface {
	GetUserByID(ctx context.Context, id string) (*model.User, error)
	GetUserByDiscordID(ctx context.Context, discordID string) (*model.User, error)
	UpsertDiscordUser(ctx context.Context, user *model.User) (*model.User, error)
}
