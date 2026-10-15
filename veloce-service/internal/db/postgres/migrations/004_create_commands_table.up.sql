CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    creator_user_id TEXT NOT NULL,

    flow_source JSONB NOT NULL,
   
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    last_deployed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS commands_app_id ON commands (app_id);
CREATE INDEX IF NOT EXISTS commands_enabled ON commands (enabled);

-- Automatically queues command deployment to Discord when commands change
CREATE OR REPLACE FUNCTION queue_app_commands_deploy() RETURNS TRIGGER AS $$
BEGIN
    UPDATE apps SET commands_deploy_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 seconds'
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.app_id ELSE NEW.app_id END;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commands_queue_app_commands_deploy
AFTER INSERT OR UPDATE OR DELETE ON commands
FOR EACH ROW EXECUTE FUNCTION queue_app_commands_deploy();
