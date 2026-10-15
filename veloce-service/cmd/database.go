package cmd

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/db/postgres"
	"github.com/golang-migrate/migrate/v4"
	"github.com/urfave/cli/v2"
)

func DatabaseCmd() *cli.Command {
	return &cli.Command{
		Name:  "database",
		Usage: "Manage database migrations and schema",
		Subcommands: []*cli.Command{
			{
				Name:  "migrate",
				Usage: "Run database migrations",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:    "config",
						Aliases: []string{"c"},
						Usage:   "Path to configuration file",
					},
				},
				Subcommands: []*cli.Command{
					{
						Name:  "up",
						Usage: "Apply all pending migrations",
						Action: func(c *cli.Context) error {
							migrater, err := initMigrater(c.String("config"))
							if err != nil {
								return err
							}
							defer migrater.Close()

							err = migrater.Up()
							if err != nil && !errors.Is(err, migrate.ErrNoChange) {
								return fmt.Errorf("failed to run migrations up: %w", err)
							}

							if errors.Is(err, migrate.ErrNoChange) {
								slog.Info("Database is already up to date")
							} else {
								slog.Info("Migrations applied successfully")
							}
							return nil
						},
					},
					{
						Name:  "down",
						Usage: "Rollback the last migration",
						Action: func(c *cli.Context) error {
							migrater, err := initMigrater(c.String("config"))
							if err != nil {
								return err
							}
							defer migrater.Close()

							err = migrater.Down()
							if err != nil && !errors.Is(err, migrate.ErrNoChange) {
								return fmt.Errorf("failed to run migrations down: %w", err)
							}

							slog.Info("Rollback completed successfully")
							return nil
						},
					},
					{
						Name:  "list",
						Usage: "List all available embedded migrations",
						Action: func(c *cli.Context) error {
							migrater, err := initMigrater(c.String("config"))
							if err != nil {
								return err
							}
							defer migrater.Close()

							files, err := migrater.List()
							if err != nil {
								return err
							}

							fmt.Println("Available embedded migrations:")
							for _, f := range files {
								fmt.Printf(" - %s\n", f)
							}
							return nil
						},
					},
					{
						Name:  "version",
						Usage: "Print the current migration version",
						Action: func(c *cli.Context) error {
							migrater, err := initMigrater(c.String("config"))
							if err != nil {
								return err
							}
							defer migrater.Close()

							version, dirty, err := migrater.Version()
							if err != nil {
								if errors.Is(err, migrate.ErrNilVersion) {
									fmt.Println("Current version: 0 (no migrations applied)")
									return nil
								}
								return err
							}

							fmt.Printf("Current version: %d (dirty: %v)\n", version, dirty)
							return nil
						},
					},
				},
			},
		},
	}
}

func initMigrater(configPath string) (*postgres.Migrater, error) {
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	client, err := postgres.New(cfg.Database.DSN(), 5)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	migrater, err := postgres.NewMigrater(client.DB)
	if err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("failed to initialize migrater: %w", err)
	}

	return migrater, nil
}
