package util

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type DiscordBotInfo struct {
	ID            string  `json:"id"`
	Username      string  `json:"username"`
	Discriminator string  `json:"discriminator"`
	Avatar        *string `json:"avatar"`
	Bot           bool    `json:"bot"`
}

type BotTokenVerifier interface {
	VerifyBotToken(ctx context.Context, token string) (*DiscordBotInfo, error)
}

type HTTPBotTokenVerifier struct {
	client *http.Client
}

func NewBotTokenVerifier() *HTTPBotTokenVerifier {
	return &HTTPBotTokenVerifier{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (v *HTTPBotTokenVerifier) VerifyBotToken(ctx context.Context, token string) (*DiscordBotInfo, error) {
	cleanToken := strings.TrimSpace(token)
	cleanToken = strings.TrimPrefix(cleanToken, "Bot ")

	if cleanToken == "" {
		return nil, errors.New("bot token cannot be empty")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://discord.com/api/v10/users/@me", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create discord request: %w", err)
	}

	req.Header.Set("Authorization", "Bot "+cleanToken)
	req.Header.Set("User-Agent", "VeloceBotPlatform/0.1.0 (https://github.com/TurboRx/veloce)")

	resp, err := v.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach discord api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, errors.New("invalid discord bot token: Discord rejected the token")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("discord api error (status %d): %s", resp.StatusCode, string(body))
	}

	var info DiscordBotInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("failed to decode discord bot profile: %w", err)
	}

	if !info.Bot {
		return nil, errors.New("the provided token belongs to a user account, not a Discord bot")
	}

	return &info, nil
}
