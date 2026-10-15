package postgres

import (
	"strings"
	"testing"
)

func TestEmbeddedMigrations(t *testing.T) {
	dirEntries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		t.Fatalf("failed to read embedded migrations dir: %v", err)
	}

	if len(dirEntries) == 0 {
		t.Fatalf("expected embedded migration files, got 0")
	}

	var upCount, downCount int
	for _, entry := range dirEntries {
		name := entry.Name()
		if strings.HasSuffix(name, ".up.sql") {
			upCount++
		} else if strings.HasSuffix(name, ".down.sql") {
			downCount++
		}
	}

	if upCount != 7 {
		t.Errorf("expected 7 .up.sql files, found %d", upCount)
	}

	if downCount != 7 {
		t.Errorf("expected 7 .down.sql files, found %d", downCount)
	}
}
