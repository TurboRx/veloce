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

type PostgresAppStore struct {
	db *sql.DB
}

func NewAppStore(db *sql.DB) *PostgresAppStore {
	return &PostgresAppStore{db: db}
}

func (s *PostgresAppStore) CreateApp(ctx context.Context, app *model.App) (*model.App, error) {
	if app.ID == "" {
		id, err := gonanoid.New()
		if err != nil {
			return nil, fmt.Errorf("failed to generate app id: %w", err)
		}
		app.ID = id
	}

	now := time.Now().UTC()
	app.CreatedAt = now
	app.UpdatedAt = now

	query := `
		INSERT INTO apps (
			id, name, description, enabled, owner_user_id, creator_user_id,
			discord_token, discord_id, discord_avatar, discord_status,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, name, description, enabled, owner_user_id, creator_user_id,
			discord_token, discord_id, discord_avatar, discord_status,
			commands_deploy_at, commands_deployed_hash, commands_deploy_error,
			created_at, updated_at
	`

	row := s.db.QueryRowContext(ctx, query,
		app.ID, app.Name, app.Description, app.Enabled, app.OwnerUserID, app.CreatorUserID,
		app.DiscordToken, app.DiscordID, app.DiscordAvatar, app.DiscordStatus,
		now, now,
	)

	return scanApp(row)
}

func (s *PostgresAppStore) GetAppByID(ctx context.Context, id string) (*model.App, error) {
	query := `
		SELECT 
			id, name, description, enabled, owner_user_id, creator_user_id,
			discord_token, discord_id, discord_avatar, discord_status,
			commands_deploy_at, commands_deployed_hash, commands_deploy_error,
			created_at, updated_at
		FROM apps
		WHERE id = $1
	`
	row := s.db.QueryRowContext(ctx, query, id)
	return scanApp(row)
}

func (s *PostgresAppStore) GetAppByDiscordID(ctx context.Context, discordID string) (*model.App, error) {
	query := `
		SELECT 
			id, name, description, enabled, owner_user_id, creator_user_id,
			discord_token, discord_id, discord_avatar, discord_status,
			commands_deploy_at, commands_deployed_hash, commands_deploy_error,
			created_at, updated_at
		FROM apps
		WHERE discord_id = $1
	`
	row := s.db.QueryRowContext(ctx, query, discordID)
	return scanApp(row)
}

func (s *PostgresAppStore) ListAppsByOwner(ctx context.Context, ownerUserID string) ([]*model.App, error) {
	query := `
		SELECT 
			id, name, description, enabled, owner_user_id, creator_user_id,
			discord_token, discord_id, discord_avatar, discord_status,
			commands_deploy_at, commands_deployed_hash, commands_deploy_error,
			created_at, updated_at
		FROM apps
		WHERE owner_user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := s.db.QueryContext(ctx, query, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to query apps: %w", err)
	}
	defer rows.Close()

	var apps []*model.App
	for rows.Next() {
		var a model.App
		var desc, avatar, hash sql.NullString
		var deployAt sql.NullTime
		var status, deployError []byte

		err := rows.Scan(
			&a.ID,
			&a.Name,
			&desc,
			&a.Enabled,
			&a.OwnerUserID,
			&a.CreatorUserID,
			&a.DiscordToken,
			&a.DiscordID,
			&avatar,
			&status,
			&deployAt,
			&hash,
			&deployError,
			&a.CreatedAt,
			&a.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan app row: %w", err)
		}

		if desc.Valid {
			a.Description = &desc.String
		}
		if avatar.Valid {
			a.DiscordAvatar = &avatar.String
		}
		if hash.Valid {
			a.CommandsDeployedHash = &hash.String
		}
		if deployAt.Valid {
			a.CommandsDeployAt = &deployAt.Time
		}
		if status != nil {
			a.DiscordStatus = status
		}
		if deployError != nil {
			a.CommandsDeployError = deployError
		}

		apps = append(apps, &a)
	}

	return apps, nil
}

func (s *PostgresAppStore) UpdateApp(ctx context.Context, app *model.App) (*model.App, error) {
	now := time.Now().UTC()
	query := `
		UPDATE apps SET
			name = $2,
			description = $3,
			enabled = $4,
			discord_avatar = $5,
			discord_status = $6,
			updated_at = $7
		WHERE id = $1
		RETURNING id, name, description, enabled, owner_user_id, creator_user_id,
			discord_token, discord_id, discord_avatar, discord_status,
			commands_deploy_at, commands_deployed_hash, commands_deploy_error,
			created_at, updated_at
	`

	row := s.db.QueryRowContext(ctx, query,
		app.ID, app.Name, app.Description, app.Enabled, app.DiscordAvatar, app.DiscordStatus, now,
	)

	return scanApp(row)
}

func (s *PostgresAppStore) UpdateAppToken(ctx context.Context, appID string, encryptedToken string) error {
	now := time.Now().UTC()
	query := `UPDATE apps SET discord_token = $2, updated_at = $3 WHERE id = $1`
	_, err := s.db.ExecContext(ctx, query, appID, encryptedToken, now)
	return err
}

func (s *PostgresAppStore) DeleteApp(ctx context.Context, id string) error {
	query := `DELETE FROM apps WHERE id = $1`
	_, err := s.db.ExecContext(ctx, query, id)
	return err
}

func (s *PostgresAppStore) QueueAppCommandsDeploy(ctx context.Context, appID string, force bool) error {
	query := `
		UPDATE apps 
		SET commands_deploy_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 seconds'
		WHERE id = $1
	`
	_, err := s.db.ExecContext(ctx, query, appID)
	return err
}

func scanApp(row *sql.Row) (*model.App, error) {
	var a model.App
	var desc, avatar, hash sql.NullString
	var deployAt sql.NullTime
	var status, deployError []byte

	err := row.Scan(
		&a.ID,
		&a.Name,
		&desc,
		&a.Enabled,
		&a.OwnerUserID,
		&a.CreatorUserID,
		&a.DiscordToken,
		&a.DiscordID,
		&avatar,
		&status,
		&deployAt,
		&hash,
		&deployError,
		&a.CreatedAt,
		&a.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan app: %w", err)
	}

	if desc.Valid {
		a.Description = &desc.String
	}
	if avatar.Valid {
		a.DiscordAvatar = &avatar.String
	}
	if hash.Valid {
		a.CommandsDeployedHash = &hash.String
	}
	if deployAt.Valid {
		a.CommandsDeployAt = &deployAt.Time
	}
	if status != nil {
		a.DiscordStatus = status
	}
	if deployError != nil {
		a.CommandsDeployError = deployError
	}

	return &a, nil
}
