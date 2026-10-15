CREATE TABLE IF NOT EXISTS event_listeners (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    creator_user_id TEXT NOT NULL,

    filter JSONB,
    flow_source JSONB NOT NULL,
    webhook_secret TEXT,
    last_run_at TIMESTAMP,
   
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS event_listeners_app_id ON event_listeners (app_id);
CREATE INDEX IF NOT EXISTS event_listeners_enabled ON event_listeners (enabled);
CREATE INDEX IF NOT EXISTS event_listeners_type ON event_listeners (type);
