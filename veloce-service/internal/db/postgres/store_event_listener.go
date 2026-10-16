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

type PostgresEventListenerStore struct {
	db *sql.DB
}

func NewEventListenerStore(db *sql.DB) *PostgresEventListenerStore {
	return &PostgresEventListenerStore{db: db}
}

func (s *PostgresEventListenerStore) CreateEventListener(ctx context.Context, l *model.EventListener) (*model.EventListener, error) {
	if l.ID == "" {
		id, err := gonanoid.New()
		if err != nil {
			return nil, fmt.Errorf("failed to generate event listener id: %w", err)
		}
		l.ID = id
	}

	if l.Source == "" {
		l.Source = model.EventSourceDiscord
	}

	flowBytes, err := json.Marshal(l.FlowSource)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal event listener flow: %w", err)
	}

	var filterBytes []byte
	if l.Filter != nil {
		fb, err := json.Marshal(l.Filter)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal event listener filter: %w", err)
		}
		filterBytes = fb
	}

	now := time.Now().UTC()
	l.CreatedAt = now
	l.UpdatedAt = now

	query := `
		INSERT INTO event_listeners (
			id, source, type, description, enabled, app_id, creator_user_id,
			filter, flow_source, webhook_secret, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err = s.db.ExecContext(
		ctx, query,
		l.ID, string(l.Source), string(l.Type), l.Description, l.Enabled,
		l.AppID, l.CreatorUserID, filterBytes, flowBytes, l.WebhookSecret,
		l.CreatedAt, l.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert event listener: %w", err)
	}

	return l, nil
}

func (s *PostgresEventListenerStore) GetEventListenerByID(ctx context.Context, id string) (*model.EventListener, error) {
	query := `
		SELECT id, source, type, description, enabled, app_id, creator_user_id,
		       filter, flow_source, webhook_secret, last_run_at, created_at, updated_at
		FROM event_listeners
		WHERE id = $1
	`
	row := s.db.QueryRowContext(ctx, query, id)
	return scanEventListener(row)
}

func (s *PostgresEventListenerStore) ListEventListenersByApp(ctx context.Context, appID string) ([]*model.EventListener, error) {
	query := `
		SELECT id, source, type, description, enabled, app_id, creator_user_id,
		       filter, flow_source, webhook_secret, last_run_at, created_at, updated_at
		FROM event_listeners
		WHERE app_id = $1
		ORDER BY created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, appID)
	if err != nil {
		return nil, fmt.Errorf("failed to query event listeners: %w", err)
	}
	defer rows.Close()

	return scanEventListeners(rows)
}

func (s *PostgresEventListenerStore) ListEnabledEventListenersByApp(ctx context.Context, appID string) ([]*model.EventListener, error) {
	query := `
		SELECT id, source, type, description, enabled, app_id, creator_user_id,
		       filter, flow_source, webhook_secret, last_run_at, created_at, updated_at
		FROM event_listeners
		WHERE app_id = $1 AND enabled = TRUE
		ORDER BY created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, appID)
	if err != nil {
		return nil, fmt.Errorf("failed to query enabled event listeners: %w", err)
	}
	defer rows.Close()

	return scanEventListeners(rows)
}

func (s *PostgresEventListenerStore) ListEnabledEventListenersByAppAndType(
	ctx context.Context,
	appID string,
	eventType model.EventListenerType,
) ([]*model.EventListener, error) {
	query := `
		SELECT id, source, type, description, enabled, app_id, creator_user_id,
		       filter, flow_source, webhook_secret, last_run_at, created_at, updated_at
		FROM event_listeners
		WHERE app_id = $1 AND enabled = TRUE AND type = $2
		ORDER BY created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, appID, string(eventType))
	if err != nil {
		return nil, fmt.Errorf("failed to query enabled event listeners by type: %w", err)
	}
	defer rows.Close()

	return scanEventListeners(rows)
}

func (s *PostgresEventListenerStore) UpdateEventListener(ctx context.Context, l *model.EventListener) (*model.EventListener, error) {
	l.UpdatedAt = time.Now().UTC()

	flowBytes, err := json.Marshal(l.FlowSource)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal flow source: %w", err)
	}

	var filterBytes []byte
	if l.Filter != nil {
		fb, err := json.Marshal(l.Filter)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal filter: %w", err)
		}
		filterBytes = fb
	}

	query := `
		UPDATE event_listeners
		SET source = $2, type = $3, description = $4, enabled = $5,
		    filter = $6, flow_source = $7, webhook_secret = $8, updated_at = $9
		WHERE id = $1
	`
	res, err := s.db.ExecContext(
		ctx, query,
		l.ID, string(l.Source), string(l.Type), l.Description, l.Enabled,
		filterBytes, flowBytes, l.WebhookSecret, l.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update event listener: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		return nil, sql.ErrNoRows
	}

	return l, nil
}

func (s *PostgresEventListenerStore) DeleteEventListener(ctx context.Context, id string) error {
	query := `DELETE FROM event_listeners WHERE id = $1`
	_, err := s.db.ExecContext(ctx, query, id)
	return err
}

func (s *PostgresEventListenerStore) UpdateLastRun(ctx context.Context, id string) error {
	query := `
		UPDATE event_listeners
		SET last_run_at = (now() AT TIME ZONE 'UTC')
		WHERE id = $1
	`
	_, err := s.db.ExecContext(ctx, query, id)
	return err
}

func scanEventListener(row *sql.Row) (*model.EventListener, error) {
	var l model.EventListener
	var sourceStr, typeStr string
	var filterBytes, flowBytes []byte
	var webhookSecret sql.NullString
	var lastRunAt sql.NullTime

	err := row.Scan(
		&l.ID, &sourceStr, &typeStr, &l.Description, &l.Enabled,
		&l.AppID, &l.CreatorUserID, &filterBytes, &flowBytes,
		&webhookSecret, &lastRunAt, &l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan event listener: %w", err)
	}

	l.Source = model.EventSource(sourceStr)
	l.Type = model.EventListenerType(typeStr)

	if webhookSecret.Valid {
		l.WebhookSecret = &webhookSecret.String
	}
	if lastRunAt.Valid {
		l.LastRunAt = &lastRunAt.Time
	}

	if len(filterBytes) > 0 {
		var filter model.EventListenerFilter
		if err := json.Unmarshal(filterBytes, &filter); err == nil {
			l.Filter = &filter
		}
	}

	if len(flowBytes) > 0 {
		if err := json.Unmarshal(flowBytes, &l.FlowSource); err != nil {
			return nil, fmt.Errorf("failed to unmarshal flow source: %w", err)
		}
	}

	return &l, nil
}

func scanEventListeners(rows *sql.Rows) ([]*model.EventListener, error) {
	var listeners []*model.EventListener
	for rows.Next() {
		var l model.EventListener
		var sourceStr, typeStr string
		var filterBytes, flowBytes []byte
		var webhookSecret sql.NullString
		var lastRunAt sql.NullTime

		err := rows.Scan(
			&l.ID, &sourceStr, &typeStr, &l.Description, &l.Enabled,
			&l.AppID, &l.CreatorUserID, &filterBytes, &flowBytes,
			&webhookSecret, &lastRunAt, &l.CreatedAt, &l.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event listener row: %w", err)
		}

		l.Source = model.EventSource(sourceStr)
		l.Type = model.EventListenerType(typeStr)

		if webhookSecret.Valid {
			l.WebhookSecret = &webhookSecret.String
		}
		if lastRunAt.Valid {
			l.LastRunAt = &lastRunAt.Time
		}

		if len(filterBytes) > 0 {
			var filter model.EventListenerFilter
			if err := json.Unmarshal(filterBytes, &filter); err == nil {
				l.Filter = &filter
			}
		}

		if len(flowBytes) > 0 {
			if err := json.Unmarshal(flowBytes, &l.FlowSource); err != nil {
				return nil, fmt.Errorf("failed to unmarshal flow source row: %w", err)
			}
		}

		listeners = append(listeners, &l)
	}
	return listeners, nil
}
