package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	gonanoid "github.com/matoous/go-nanoid/v2"
)

type PostgresCommandStore struct {
	db *sql.DB
}

func NewCommandStore(db *sql.DB) *PostgresCommandStore {
	return &PostgresCommandStore{db: db}
}

func (s *PostgresCommandStore) CreateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	if cmd.ID == "" {
		id, err := gonanoid.New()
		if err != nil {
			return nil, fmt.Errorf("failed to generate command id: %w", err)
		}
		cmd.ID = id
	}

	flowBytes, err := json.Marshal(cmd.FlowSource)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal command flow: %w", err)
	}

	now := time.Now().UTC()
	cmd.CreatedAt = now
	cmd.UpdatedAt = now

	query := `
		INSERT INTO commands (
			id, name, description, enabled, app_id, creator_user_id, flow_source, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err = s.db.ExecContext(
		ctx, query,
		cmd.ID, cmd.Name, cmd.Description, cmd.Enabled,
		cmd.AppID, cmd.CreatorUserID, flowBytes,
		cmd.CreatedAt, cmd.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert command: %w", err)
	}

	return cmd, nil
}

func (s *PostgresCommandStore) GetCommandByID(ctx context.Context, id string) (*model.Command, error) {
	query := `
		SELECT id, name, description, enabled, app_id, creator_user_id, flow_source, created_at, updated_at, last_deployed_at
		FROM commands
		WHERE id = $1
	`
	row := s.db.QueryRowContext(ctx, query, id)
	return scanCommand(row)
}

func (s *PostgresCommandStore) ListCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	query := `
		SELECT id, name, description, enabled, app_id, creator_user_id, flow_source, created_at, updated_at, last_deployed_at
		FROM commands
		WHERE app_id = $1
		ORDER BY created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, appID)
	if err != nil {
		return nil, fmt.Errorf("failed to query commands: %w", err)
	}
	defer rows.Close()

	return scanCommands(rows)
}

func (s *PostgresCommandStore) ListEnabledCommandsByApp(ctx context.Context, appID string) ([]*model.Command, error) {
	query := `
		SELECT id, name, description, enabled, app_id, creator_user_id, flow_source, created_at, updated_at, last_deployed_at
		FROM commands
		WHERE app_id = $1 AND enabled = TRUE
		ORDER BY created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, appID)
	if err != nil {
		return nil, fmt.Errorf("failed to query enabled commands: %w", err)
	}
	defer rows.Close()

	return scanCommands(rows)
}

func (s *PostgresCommandStore) UpdateCommand(ctx context.Context, cmd *model.Command) (*model.Command, error) {
	cmd.UpdatedAt = time.Now().UTC()

	flowBytes, err := json.Marshal(cmd.FlowSource)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal flow source: %w", err)
	}

	query := `
		UPDATE commands
		SET name = $2, description = $3, enabled = $4, flow_source = $5, updated_at = $6
		WHERE id = $1
	`
	res, err := s.db.ExecContext(ctx, query, cmd.ID, cmd.Name, cmd.Description, cmd.Enabled, flowBytes, cmd.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to update command: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		return nil, sql.ErrNoRows
	}

	return cmd, nil
}

func (s *PostgresCommandStore) DeleteCommand(ctx context.Context, id string) error {
	query := `DELETE FROM commands WHERE id = $1`
	_, err := s.db.ExecContext(ctx, query, id)
	return err
}

func (s *PostgresCommandStore) UpdateLastDeployed(ctx context.Context, commandIDs []string) error {
	if len(commandIDs) == 0 {
		return nil
	}
	query := `
		UPDATE commands
		SET last_deployed_at = (now() AT TIME ZONE 'UTC')
		WHERE id = ANY($1)
	`
	_, err := s.db.ExecContext(ctx, query, commandIDs)
	return err
}

func scanCommand(row *sql.Row) (*model.Command, error) {
	var c model.Command
	var flowBytes []byte
	var lastDeployedAt sql.NullTime

	err := row.Scan(
		&c.ID, &c.Name, &c.Description, &c.Enabled,
		&c.AppID, &c.CreatorUserID, &flowBytes,
		&c.CreatedAt, &c.UpdatedAt, &lastDeployedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan command: %w", err)
	}

	if lastDeployedAt.Valid {
		c.LastDeployedAt = &lastDeployedAt.Time
	}

	if len(flowBytes) > 0 {
		if err := json.Unmarshal(flowBytes, &c.FlowSource); err != nil {
			return nil, fmt.Errorf("failed to unmarshal command flow: %w", err)
		}
	}

	return &c, nil
}

func scanCommands(rows *sql.Rows) ([]*model.Command, error) {
	var commands []*model.Command
	for rows.Next() {
		var c model.Command
		var flowBytes []byte
		var lastDeployedAt sql.NullTime

		err := rows.Scan(
			&c.ID, &c.Name, &c.Description, &c.Enabled,
			&c.AppID, &c.CreatorUserID, &flowBytes,
			&c.CreatedAt, &c.UpdatedAt, &lastDeployedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan command row: %w", err)
		}

		if lastDeployedAt.Valid {
			c.LastDeployedAt = &lastDeployedAt.Time
		}

		if len(flowBytes) > 0 {
			if err := json.Unmarshal(flowBytes, &c.FlowSource); err != nil {
				return nil, fmt.Errorf("failed to unmarshal command row flow: %w", err)
			}
		}

		commands = append(commands, &c)
	}
	return commands, nil
}
