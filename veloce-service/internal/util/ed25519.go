package util

import (
	"crypto/ed25519"
	"encoding/hex"
)

// VerifyDiscordInteraction verifies the Ed25519 signature of an incoming Discord HTTP interaction.
// Discord signs the concatenation of timestamp and request body.
func VerifyDiscordInteraction(publicKeyHex, signatureHex, timestamp string, body []byte) bool {
	if publicKeyHex == "" || signatureHex == "" || timestamp == "" {
		return false
	}

	publicKey, err := hex.DecodeString(publicKeyHex)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return false
	}

	signature, err := hex.DecodeString(signatureHex)
	if err != nil || len(signature) != ed25519.SignatureSize {
		return false
	}

	msg := make([]byte, 0, len(timestamp)+len(body))
	msg = append(msg, []byte(timestamp)...)
	msg = append(msg, body...)

	return ed25519.Verify(publicKey, msg, signature)
}
