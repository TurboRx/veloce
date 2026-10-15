CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    creator_user_id TEXT NOT NULL,

    discord_token TEXT NOT NULL,
    discord_id TEXT NOT NULL UNIQUE,
    discord_avatar TEXT,
    discord_status JSONB,

    commands_deploy_at TIMESTAMP,
    commands_deployed_hash TEXT,
    commands_deploy_error JSONB,
   
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS apps_owner_user_id ON apps (owner_user_id);
CREATE INDEX IF NOT EXISTS apps_discord_id ON apps (discord_id);
CREATE INDEX IF NOT EXISTS apps_commands_deploy_at ON apps (commands_deploy_at) WHERE commands_deploy_at IS NOT NULL;
