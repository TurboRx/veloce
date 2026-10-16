package util

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"testing"
)

func TestVerifyDiscordInteraction(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate ed25519 key: %v", err)
	}

	pubHex := hex.EncodeToString(pub)
	timestamp := "1729068000"
	body := []byte(`{"type":1}`)

	msg := append([]byte(timestamp), body...)
	sig := ed25519.Sign(priv, msg)
	sigHex := hex.EncodeToString(sig)

	// Valid signature
	if !VerifyDiscordInteraction(pubHex, sigHex, timestamp, body) {
		t.Errorf("expected valid signature to verify successfully")
	}

	// Tampered body
	tamperedBody := []byte(`{"type":2}`)
	if VerifyDiscordInteraction(pubHex, sigHex, timestamp, tamperedBody) {
		t.Errorf("expected verification to fail with tampered body")
	}

	// Tampered timestamp
	if VerifyDiscordInteraction(pubHex, sigHex, "1729068001", body) {
		t.Errorf("expected verification to fail with tampered timestamp")
	}

	// Invalid hex public key
	if VerifyDiscordInteraction("invalid_hex", sigHex, timestamp, body) {
		t.Errorf("expected verification to fail with invalid hex public key")
	}

	// Empty fields
	if VerifyDiscordInteraction("", sigHex, timestamp, body) {
		t.Errorf("expected verification to fail with empty public key")
	}
}
