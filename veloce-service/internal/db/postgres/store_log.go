package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type PostgresLogStore struct {
	db *sql.DB
}

func NewLogStore(db *sql.DB) *PostgresLogStore {
	return &PostgresLogStore{db: db}
}

func (s *PostgresLogStore) CreateLog(ctx context.Context, log *model.Log) (*model.Log, error) {
	var detailsBytes []byte
	var err error
	if log.Details != nil {
		detailsBytes, err = json.Marshal(log.Details)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal log details: %w", err)
		}
	}

	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now().UTC()
	}

	query := `
		INSERT INTO logs (
			app_id, message, level, details, created_at
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	err = s.db.QueryRowContext(
		ctx, query,
		log.AppID, log.Message, string(log.Level), detailsBytes, log.CreatedAt,
	).Scan(&log.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert log: %w", err)
	}

	return log, nil
}

func (s *PostgresLogStore) ListLogsByApp(ctx context.Context, appID string, limit, offset int) ([]*model.Log, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	query := `
		SELECT id, app_id, message, level, details, created_at
		FROM logs
		WHERE app_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := s.db.QueryContext(ctx, query, appID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to query logs: %w", err)
	}
	defer rows.Close()

	logs := make([]*model.Log, 0)
	for rows.Next() {
		var l model.Log
		var levelStr string
		var detailsBytes []byte

		if err := rows.Scan(&l.ID, &l.AppID, &l.Message, &levelStr, &detailsBytes, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan log row: %w", err)
		}
		l.Level = model.LogLevel(levelStr)
		if len(detailsBytes) > 0 {
			_ = json.Unmarshal(detailsBytes, &l.Details)
		}
		logs = append(logs, &l)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading logs rows: %w", err)
	}

	return logs, nil
}

func (s *PostgresLogStore) DeleteOldLogs(ctx context.Context, olderThan time.Time) error {
	query := `DELETE FROM logs WHERE created_at < $1`
	_, err := s.db.ExecContext(ctx, query, olderThan)
	if err != nil {
		return fmt.Errorf("failed to delete old logs: %w", err)
	}
	return nil
}
