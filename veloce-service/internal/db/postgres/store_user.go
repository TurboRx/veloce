package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	gonanoid "github.com/matoous/go-nanoid/v2"
)

type PostgresUserStore struct {
	db *sql.DB
}

func NewUserStore(db *sql.DB) *PostgresUserStore {
	return &PostgresUserStore{db: db}
}

func (s *PostgresUserStore) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	query := `
		SELECT id, email, display_name, discord_id, discord_username, discord_avatar, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	row := s.db.QueryRowContext(ctx, query, id)
	return scanUser(row)
}

func (s *PostgresUserStore) GetUserByDiscordID(ctx context.Context, discordID string) (*model.User, error) {
	query := `
		SELECT id, email, display_name, discord_id, discord_username, discord_avatar, created_at, updated_at
		FROM users
		WHERE discord_id = $1
	`
	row := s.db.QueryRowContext(ctx, query, discordID)
	return scanUser(row)
}

func (s *PostgresUserStore) UpsertDiscordUser(ctx context.Context, u *model.User) (*model.User, error) {
	now := time.Now().UTC()
	if u.ID == "" {
		id, err := gonanoid.New()
		if err != nil {
			return nil, fmt.Errorf("failed to generate user id: %w", err)
		}
		u.ID = id
	}

	query := `
		INSERT INTO users (id, email, display_name, discord_id, discord_username, discord_avatar, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (discord_id) DO UPDATE SET
			email = EXCLUDED.email,
			display_name = EXCLUDED.display_name,
			discord_username = EXCLUDED.discord_username,
			discord_avatar = EXCLUDED.discord_avatar,
			updated_at = EXCLUDED.updated_at
		RETURNING id, email, display_name, discord_id, discord_username, discord_avatar, created_at, updated_at
	`

	row := s.db.QueryRowContext(ctx, query,
		u.ID, u.Email, u.DisplayName, u.DiscordID, u.DiscordUsername, u.DiscordAvatar, now, now,
	)

	return scanUser(row)
}

func scanUser(row *sql.Row) (*model.User, error) {
	var u model.User
	var avatar sql.NullString

	err := row.Scan(
		&u.ID,
		&u.Email,
		&u.DisplayName,
		&u.DiscordID,
		&u.DiscordUsername,
		&avatar,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan user: %w", err)
	}

	if avatar.Valid {
		u.DiscordAvatar = &avatar.String
	}

	return &u, nil
}
