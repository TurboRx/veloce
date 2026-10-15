package cmd

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/api"
	"github.com/TurboRx/veloce/veloce-service/internal/config"
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

			server := api.NewServer(cfg)

			errChan := make(chan error, 1)
			go func() {
				errChan <- server.Start()
			}()

			quit := make(chan os.Signal, 1)
			signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

			select {
			case sig := <-quit:
				slog.Info("Received signal, exiting gracefully", slog.String("signal", sig.String()))
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				return server.Shutdown(ctx)
			case err := <-errChan:
				return err
			}
		},
	}
}
