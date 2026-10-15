package postgres

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type PostgresSessionStore struct {
	db *sql.DB
}

func NewSessionStore(db *sql.DB) *PostgresSessionStore {
	return &PostgresSessionStore{db: db}
}

func HashSessionKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

func GenerateSessionKey() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random session bytes: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

func (s *PostgresSessionStore) CreateSession(ctx context.Context, userID string, duration time.Duration) (string, error) {
	rawKey, err := GenerateSessionKey()
	if err != nil {
		return "", err
	}

	keyHash := HashSessionKey(rawKey)
	now := time.Now().UTC()
	expiresAt := now.Add(duration)

	query := `
		INSERT INTO sessions (key_hash, user_id, created_at, expires_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err = s.db.ExecContext(ctx, query, keyHash, userID, now, expiresAt)
	if err != nil {
		return "", fmt.Errorf("failed to insert session: %w", err)
	}

	return rawKey, nil
}

func (s *PostgresSessionStore) GetSessionByKey(ctx context.Context, rawKey string) (*model.Session, *model.User, error) {
	keyHash := HashSessionKey(rawKey)
	query := `
		SELECT 
			s.key_hash, s.user_id, s.created_at, s.expires_at,
			u.id, u.email, u.display_name, u.discord_id, u.discord_username, u.discord_avatar, u.created_at, u.updated_at
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.key_hash = $1 AND s.expires_at > $2
	`

	var sess model.Session
	var u model.User
	var avatar sql.NullString

	err := s.db.QueryRowContext(ctx, query, keyHash, time.Now().UTC()).Scan(
		&sess.KeyHash,
		&sess.UserID,
		&sess.CreatedAt,
		&sess.ExpiresAt,
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
			return nil, nil, nil
		}
		return nil, nil, fmt.Errorf("failed to get session: %w", err)
	}

	if avatar.Valid {
		u.DiscordAvatar = &avatar.String
	}

	return &sess, &u, nil
}

func (s *PostgresSessionStore) DeleteSession(ctx context.Context, rawKey string) error {
	keyHash := HashSessionKey(rawKey)
	query := `DELETE FROM sessions WHERE key_hash = $1`
	_, err := s.db.ExecContext(ctx, query, keyHash)
	return err
}

func (s *PostgresSessionStore) DeleteExpiredSessions(ctx context.Context) error {
	query := `DELETE FROM sessions WHERE expires_at <= $1`
	_, err := s.db.ExecContext(ctx, query, time.Now().UTC())
	return err
}
