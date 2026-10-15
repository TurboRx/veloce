package cmd

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/api"
	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/core/command"
	"github.com/TurboRx/veloce/veloce-service/internal/core/engine"
	"github.com/TurboRx/veloce/veloce-service/internal/core/gateway"
	"github.com/TurboRx/veloce/veloce-service/internal/db/postgres"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/urfave/cli/v2"
)

func ServerCmd() *cli.Command {
	return &cli.Command{
		Name:  "server",
		Usage: "Start the Veloce API and Bot service",
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:    "config",
				Aliases: []string{"c"},
				Usage:   "Path to configuration file",
			},
		},
		Action: func(c *cli.Context) error {
			cfgPath := c.String("config")
			cfg, err := config.Load(cfgPath)
			if err != nil {
				return err
			}

			// Initialize Token Encryption
			var tokenCrypt *util.SymmetricCrypt
			if cfg.Encryption.TokenEncryptionKey != "" {
				tc, err := util.NewSymmetricCrypt(cfg.Encryption.TokenEncryptionKey)
				if err != nil {
					slog.Warn("Failed to initialize token encryption", slog.String("error", err.Error()))
				} else {
					tokenCrypt = tc
					slog.Info("Token encryption initialized successfully")
				}
			}

			// Initialize Database client
			dbClient, err := postgres.New(cfg.Database.DSN(), 25)
			if err != nil {
				slog.Warn("Failed to establish database connection, running in degraded mode", slog.String("error", err.Error()))
			} else {
				defer dbClient.Close()
				slog.Info("PostgreSQL connection initialized successfully")
			}

			var userStore *postgres.PostgresUserStore
			var sessionStore *postgres.PostgresSessionStore
			var appStore *postgres.PostgresAppStore
			var commandStore *postgres.PostgresCommandStore
			if dbClient != nil && dbClient.DB != nil {
				userStore = postgres.NewUserStore(dbClient.DB)
				sessionStore = postgres.NewSessionStore(dbClient.DB)
				appStore = postgres.NewAppStore(dbClient.DB)
				commandStore = postgres.NewCommandStore(dbClient.DB)
			}

			botVerifier := util.NewBotTokenVerifier()
			server := api.NewServer(cfg, userStore, sessionStore, appStore, commandStore, tokenCrypt, botVerifier)

			gatewayCtx, cancelGateway := context.WithCancel(context.Background())
			defer cancelGateway()

			if cfg.Gateway.Enabled && appStore != nil && tokenCrypt != nil {
				eventRouter := gateway.NewEventRouter()
				eventRouter.RegisterHandler(&gateway.LoggingEventHandler{})

				if commandStore != nil {
					dispatcher := engine.NewInteractionDispatcher(commandStore)
					eventRouter.RegisterHandler(dispatcher)
				}

				gatewayManager := gateway.NewGatewayManager(
					appStore,
					tokenCrypt,
					eventRouter,
					gateway.GatewayManagerConfig{
						ClusterCount: cfg.Gateway.ClusterCount,
						ClusterIndex: cfg.Gateway.ClusterIndex,
						PollInterval: 10 * time.Second,
					},
				)
				go gatewayManager.Run(gatewayCtx)

				if commandStore != nil {
					commandManager := command.NewCommandManager(appStore, commandStore, gatewayManager, tokenCrypt)
					go commandManager.Run(gatewayCtx)
				}
			}

			errChan := make(chan error, 1)
			go func() {
				errChan <- server.Start()
			}()

			quit := make(chan os.Signal, 1)
			signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

			select {
			case sig := <-quit:
				slog.Info("Received signal, exiting gracefully", slog.String("signal", sig.String()))
				cancelGateway()
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				if err := server.Shutdown(ctx); err != nil {
					return fmt.Errorf("server shutdown error: %w", err)
				}
				return nil
			case err := <-errChan:
				cancelGateway()
				return err
			}
		},
	}
}
