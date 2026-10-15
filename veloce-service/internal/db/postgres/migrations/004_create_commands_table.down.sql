DROP TRIGGER IF EXISTS commands_queue_app_commands_deploy ON commands;
DROP FUNCTION IF EXISTS queue_app_commands_deploy();
DROP TABLE IF EXISTS commands CASCADE;
