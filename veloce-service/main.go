package main

import (
	"log/slog"
	"os"

	"github.com/TurboRx/veloce/veloce-service/cmd"
	"github.com/urfave/cli/v2"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	app := &cli.App{
		Name:    "veloce",
		Usage:   "The high-velocity, no-code Discord bot builder service",
		Version: "0.1.0",
		Commands: []*cli.Command{
			cmd.ServerCmd(),
		},
	}

	if err := app.Run(os.Args); err != nil {
		slog.Error("Application error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}
