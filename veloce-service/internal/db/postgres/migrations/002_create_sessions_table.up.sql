CREATE TABLE IF NOT EXISTS sessions (
    key_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
