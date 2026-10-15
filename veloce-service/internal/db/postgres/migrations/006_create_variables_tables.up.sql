CREATE TABLE IF NOT EXISTS variables (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scoped BOOLEAN NOT NULL DEFAULT FALSE,

    app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
   
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,

    UNIQUE (app_id, name)
);

CREATE INDEX IF NOT EXISTS variables_app_id ON variables (app_id);

CREATE TABLE IF NOT EXISTS variable_values (
    id BIGSERIAL PRIMARY KEY,
    variable_id TEXT NOT NULL REFERENCES variables(id) ON DELETE CASCADE,
    scope TEXT, -- resolved guild_id, user_id, channel_id, or custom
    value JSONB NOT NULL,
   
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,

    UNIQUE NULLS NOT DISTINCT (variable_id, scope)
);

CREATE INDEX IF NOT EXISTS variable_values_variable_id ON variable_values (variable_id);
CREATE INDEX IF NOT EXISTS variable_values_scope ON variable_values (scope);
