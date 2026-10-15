package command

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/core/gateway"
	"github.com/TurboRx/veloce/veloce-service/internal/store"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
)

type CommandManager struct {
	appStore       store.AppStore
	commandStore   store.CommandStore
	gatewayManager *gateway.GatewayManager
	tokenCrypt     *util.SymmetricCrypt
}

func NewCommandManager(
	appStore store.AppStore,
	commandStore store.CommandStore,
	gatewayManager *gateway.GatewayManager,
	tokenCrypt *util.SymmetricCrypt,
) *CommandManager {
	return &CommandManager{
		appStore:       appStore,
		commandStore:   commandStore,
		gatewayManager: gatewayManager,
		tokenCrypt:     tokenCrypt,
	}
}

// Run starts the background worker polling for pending command deployments.
func (m *CommandManager) Run(ctx context.Context) {
	slog.Info("Starting Discord command deployer worker")
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.DeployDueApps(ctx)
		}
	}
}

// DeployDueApps deploys queued slash commands to Discord for all due apps.
func (m *CommandManager) DeployDueApps(ctx context.Context) int {
	appIDs, err := m.appStore.AppIDsWithDueCommandsDeploy(ctx, 20)
	if err != nil {
		if ctx.Err() == nil {
			slog.Error("Failed to fetch apps with due commands deploy", slog.String("error", err.Error()))
		}
		return 0
	}

	for _, appID := range appIDs {
		if err := m.DeployAppCommands(ctx, appID); err != nil {
			slog.Error("Failed to deploy commands for app",
				slog.String("app_id", appID),
				slog.String("error", err.Error()),
			)
		}
	}

	return len(appIDs)
}

func (m *CommandManager) DeployAppCommands(ctx context.Context, appID string) error {
	app, err := m.appStore.GetAppByID(ctx, appID)
	if err != nil {
		return fmt.Errorf("failed to get app: %w", err)
	}
	if app == nil {
		return fmt.Errorf("app not found: %s", appID)
	}

	commands, err := m.commandStore.ListEnabledCommandsByApp(ctx, appID)
	if err != nil {
		return fmt.Errorf("failed to list enabled commands: %w", err)
	}

	discordCommands := make([]api.CreateCommandData, 0, len(commands))
	deployedIDs := make([]string, 0, len(commands))

	for _, cmd := range commands {
		compiled, err := flow.CompileCommand(cmd.FlowSource)
		if err != nil {
			errStr := fmt.Sprintf("Command '%s' compilation error: %s", cmd.Name, err.Error())
			_ = m.appStore.UpdateCommandsDeployResult(ctx, appID, "", &errStr)
			return fmt.Errorf("failed to compile command %s: %w", cmd.Name, err)
		}
		discordCommands = append(discordCommands, compiled.CommandData())
		deployedIDs = append(deployedIDs, cmd.ID)
	}

	// Calculate hash to avoid redundant Discord API calls
	hashBytes, err := json.Marshal(discordCommands)
	if err != nil {
		return fmt.Errorf("failed to marshal commands for hash: %w", err)
	}
	h := sha256.Sum256(hashBytes)
	currentHash := hex.EncodeToString(h[:])

	// If commands haven't changed, skip Discord REST call
	if app.CommandsDeployedHash != nil && *app.CommandsDeployedHash == currentHash {
		return m.appStore.UpdateCommandsDeployResult(ctx, appID, currentHash, nil)
	}

	// Obtain Discord API client
	rawToken, err := m.tokenCrypt.DecryptString(app.DiscordToken)
	if err != nil {
		errStr := fmt.Sprintf("Failed to decrypt bot token: %s", err.Error())
		_ = m.appStore.UpdateCommandsDeployResult(ctx, appID, "", &errStr)
		return fmt.Errorf("failed to decrypt bot token: %w", err)
	}

	client := api.NewClient("Bot " + rawToken)
	appSnowflake, err := strconv.ParseInt(app.DiscordID, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid discord application id %s: %w", app.DiscordID, err)
	}

	slog.Info("Deploying slash commands to Discord",
		slog.String("app_id", appID),
		slog.Int("command_count", len(discordCommands)),
	)

	_, err = client.BulkOverwriteCommands(discord.AppID(appSnowflake), discordCommands)
	if err != nil {
		errStr := fmt.Sprintf("Discord API BulkOverwriteCommands error: %s", err.Error())
		_ = m.appStore.UpdateCommandsDeployResult(ctx, appID, "", &errStr)
		return fmt.Errorf("failed to deploy commands to Discord: %w", err)
	}

	// Update last deployed timestamps and hash
	if err := m.appStore.UpdateCommandsDeployResult(ctx, appID, currentHash, nil); err != nil {
		return fmt.Errorf("failed to update deploy result: %w", err)
	}

	if err := m.commandStore.UpdateLastDeployed(ctx, deployedIDs); err != nil {
		slog.Warn("Failed to update commands last_deployed_at", slog.String("error", err.Error()))
	}

	return nil
}
