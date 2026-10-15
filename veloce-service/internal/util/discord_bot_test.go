package util

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVerifyBotToken(t *testing.T) {
	// Mock server mimicking Discord API /users/@me
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bot valid_bot_token" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"message":"401: Unauthorized","code":0}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"id": "999888777",
			"username": "VeloceHelperBot",
			"discriminator": "0000",
			"avatar": "a_1234567890abcdef",
			"bot": true
		}`))
	}))
	defer server.Close()

	verifier := &HTTPBotTokenVerifier{
		client: server.Client(),
	}

	// 1. Empty token
	_, err := verifier.VerifyBotToken(context.Background(), "")
	if err == nil {
		t.Errorf("expected error for empty token")
	}

	// 2. Invalid token
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
	req.Header.Set("Authorization", "Bot invalid_token")
	resp, _ := server.Client().Do(req)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid token, got %d", resp.StatusCode)
	}

	// 3. Valid token
	reqValid, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
	reqValid.Header.Set("Authorization", "Bot valid_bot_token")
	respValid, _ := server.Client().Do(reqValid)
	if respValid.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for valid token, got %d", respValid.StatusCode)
	}
}
