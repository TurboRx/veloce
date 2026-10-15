package util

import (
	"testing"
)

func TestSymmetricCrypt(t *testing.T) {
	// 32-byte hex key (64 characters)
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	crypt, err := NewSymmetricCrypt(key)
	if err != nil {
		t.Fatalf("failed to create crypt: %v", err)
	}

	secret := "bot_token_secret_12345_!@#$%^"
	encrypted, err := crypt.EncryptString(secret)
	if err != nil {
		t.Fatalf("failed to encrypt: %v", err)
	}

	if encrypted == secret {
		t.Fatalf("ciphertext should not match plaintext")
	}

	decrypted, err := crypt.DecryptString(encrypted)
	if err != nil {
		t.Fatalf("failed to decrypt: %v", err)
	}

	if decrypted != secret {
		t.Fatalf("expected decrypted '%s', got '%s'", secret, decrypted)
	}
}
