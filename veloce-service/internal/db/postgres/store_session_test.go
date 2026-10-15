package postgres

import (
	"testing"
)

func TestSessionKeyGenerationAndHashing(t *testing.T) {
	key1, err := GenerateSessionKey()
	if err != nil {
		t.Fatalf("failed to generate key1: %v", err)
	}

	key2, err := GenerateSessionKey()
	if err != nil {
		t.Fatalf("failed to generate key2: %v", err)
	}

	if key1 == key2 {
		t.Fatalf("generated keys should not collide")
	}

	if len(key1) != 64 {
		t.Errorf("expected 64 characters hex key, got %d", len(key1))
	}

	hash1 := HashSessionKey(key1)
	hash2 := HashSessionKey(key1)
	if hash1 != hash2 {
		t.Errorf("hash function must be deterministic")
	}

	hashDiff := HashSessionKey(key2)
	if hash1 == hashDiff {
		t.Errorf("different keys must have different hashes")
	}
}
