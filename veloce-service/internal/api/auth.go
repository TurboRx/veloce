package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"golang.org/x/oauth2"
)

type DiscordUserResponse struct {
	ID            string  `json:"id"`
	Username      string  `json:"username"`
	Discriminator string  `json:"discriminator"`
	GlobalName    *string `json:"global_name"`
	Avatar        *string `json:"avatar"`
	Email         string  `json:"email"`
}

func (s *Server) getOAuth2Config() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.config.Discord.ClientID,
		ClientSecret: s.config.Discord.ClientSecret,
		RedirectURL:  s.config.Discord.RedirectURI,
		Scopes:       []string{"identify", "email"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://discord.com/api/oauth2/authorize",
			TokenURL: "https://discord.com/api/oauth2/token",
		},
	}
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	oauthConfig := s.getOAuth2Config()
	if oauthConfig.ClientID == "" {
		http.Error(w, `{"error":"misconfigured","message":"Discord client credentials not configured"}`, http.StatusInternalServerError)
		return
	}

	state, err := postgresGenerateState()
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "veloce_oauth_state",
		Value:    state,
		Path:     "/",
		Expires:  time.Now().Add(10 * time.Minute),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	url := oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie("veloce_oauth_state")
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, `{"error":"invalid_state","message":"Invalid OAuth state"}`, http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error":"missing_code","message":"Missing authorization code"}`, http.StatusBadRequest)
		return
	}

	oauthConfig := s.getOAuth2Config()
	token, err := oauthConfig.Exchange(r.Context(), code)
	if err != nil {
		slog.Error("Failed to exchange discord oauth code", slog.String("error", err.Error()))
		http.Error(w, `{"error":"token_exchange_failed"}`, http.StatusBadRequest)
		return
	}

	discordUser, err := fetchDiscordUser(r.Context(), token.AccessToken)
	if err != nil {
		slog.Error("Failed to fetch discord user profile", slog.String("error", err.Error()))
		http.Error(w, `{"error":"profile_fetch_failed"}`, http.StatusInternalServerError)
		return
	}

	displayName := discordUser.Username
	if discordUser.GlobalName != nil && *discordUser.GlobalName != "" {
		displayName = *discordUser.GlobalName
	}

	user, err := s.userStore.UpsertDiscordUser(r.Context(), &model.User{
		Email:           discordUser.Email,
		DisplayName:     displayName,
		DiscordID:       discordUser.ID,
		DiscordUsername: discordUser.Username,
		DiscordAvatar:   discordUser.Avatar,
	})
	if err != nil {
		slog.Error("Failed to upsert user into database", slog.String("error", err.Error()))
		http.Error(w, `{"error":"database_error"}`, http.StatusInternalServerError)
		return
	}

	// Create 30-day session
	sessionDuration := 30 * 24 * time.Hour
	rawKey, err := s.sessionStore.CreateSession(r.Context(), user.ID, sessionDuration)
	if err != nil {
		slog.Error("Failed to create user session", slog.String("error", err.Error()))
		http.Error(w, `{"error":"session_creation_failed"}`, http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     CookieSessionName,
		Value:    rawKey,
		Path:     "/",
		Expires:  time.Now().Add(sessionDuration),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect back to frontend
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	token := ExtractToken(r)
	if token != "" {
		_ = s.sessionStore.DeleteSession(r.Context(), token)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     CookieSessionName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"logged_out"}`))
}

func (s *Server) handleCurrentUser(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

func fetchDiscordUser(ctx context.Context, accessToken string) (*DiscordUserResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://discord.com/api/v10/users/@me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("discord api error (status %d): %s", resp.StatusCode, string(body))
	}

	var u DiscordUserResponse
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, err
	}

	return &u, nil
}

func postgresGenerateState() (string, error) {
	b := make([]byte, 16)
	_, err := io.ReadFull(timeReader{}, b)
	if err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano()), nil
	}
	return fmt.Sprintf("%x", b), nil
}

type timeReader struct{}

func (timeReader) Read(p []byte) (n int, err error) {
	now := time.Now().UnixNano()
	for i := range p {
		p[i] = byte(now >> (i * 8))
	}
	return len(p), nil
}
