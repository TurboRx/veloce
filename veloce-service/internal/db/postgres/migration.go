package postgres

import (
	"database/sql"
	"embed"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Migrater struct {
	m  *migrate.Migrate
	db *sql.DB
}

func NewMigrater(db *sql.DB) (*Migrater, error) {
	sourceDriver, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to create migration source driver: %w", err)
	}

	dbDriver, err := postgres.WithInstance(db, &postgres.Config{
		MigrationsTable: "schema_migrations",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create postgres migration driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", sourceDriver, "postgres", dbDriver)
	if err != nil {
		return nil, fmt.Errorf("failed to create migrate instance: %w", err)
	}

	return &Migrater{
		m:  m,
		db: db,
	}, nil
}

func (mig *Migrater) Up() error {
	return mig.m.Up()
}

func (mig *Migrater) Down() error {
	return mig.m.Down()
}

func (mig *Migrater) Version() (uint, bool, error) {
	return mig.m.Version()
}

func (mig *Migrater) Force(version int) error {
	return mig.m.Force(version)
}

func (mig *Migrater) List() ([]string, error) {
	dirEntries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return nil, err
	}

	files := make([]string, 0, len(dirEntries))
	for _, entry := range dirEntries {
		files = append(files, entry.Name())
	}
	return files, nil
}

func (mig *Migrater) Close() error {
	srcErr, dbErr := mig.m.Close()
	if srcErr != nil {
		return srcErr
	}
	return dbErr
}
