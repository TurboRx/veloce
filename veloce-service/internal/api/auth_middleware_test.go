package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
)

type mockSessionStore struct {
	session *model.Session
	user    *model.User
}

func (m *mockSessionStore) CreateSession(ctx context.Context, userID string, duration time.Duration) (string, error) {
	return "test_raw_key", nil
}

func (m *mockSessionStore) GetSessionByKey(ctx context.Context, rawKey string) (*model.Session, *model.User, error) {
	if rawKey == "valid_key" {
		return m.session, m.user, nil
	}
	return nil, nil, nil
}

func (m *mockSessionStore) DeleteSession(ctx context.Context, rawKey string) error {
	return nil
}

func (m *mockSessionStore) DeleteExpiredSessions(ctx context.Context) error {
	return nil
}

func TestAuthMiddleware(t *testing.T) {
	mockUser := &model.User{
		ID:              "user_123",
		Email:           "test@veloce.dev",
		DisplayName:     "TestUser",
		DiscordID:       "1234567890",
		DiscordUsername: "testuser",
	}
	mockSess := &model.Session{
		KeyHash:   "hash_123",
		UserID:    mockUser.ID,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	}

	store := &mockSessionStore{
		session: mockSess,
		user:    mockUser,
	}

	handler := AuthMiddleware(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUserFromContext(r.Context())
		if user != nil {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(user.DisplayName))
		} else {
			w.WriteHeader(http.StatusUnauthorized)
		}
	}))

	// Case 1: No auth header or cookie -> Unauthorized
	req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated request, got %d", rr1.Code)
	}

	// Case 2: Valid Bearer token -> OK
	req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req2.Header.Set("Authorization", "Bearer valid_key")
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("expected 200 for valid token, got %d", rr2.Code)
	}
	if rr2.Body.String() != "TestUser" {
		t.Errorf("expected body 'TestUser', got '%s'", rr2.Body.String())
	}

	// Case 3: Valid Cookie -> OK
	req3 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req3.AddCookie(&http.Cookie{Name: CookieSessionName, Value: "valid_key"})
	rr3 := httptest.NewRecorder()
	handler.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Errorf("expected 200 for valid cookie, got %d", rr3.Code)
	}

	// Case 4: Invalid key -> Unauthorized
	req4 := httptest.NewRequest(http.MethodGet, "/test", nil)
	req4.Header.Set("Authorization", "Bearer invalid_key")
	rr4 := httptest.NewRecorder()
	handler.ServeHTTP(rr4, req4)
	if rr4.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid key, got %d", rr4.Code)
	}
}

func TestRequireAuthMiddleware(t *testing.T) {
	protected := RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("protected_data"))
	})

	// Without user in context
	req1 := httptest.NewRequest(http.MethodGet, "/protected", nil)
	rr1 := httptest.NewRecorder()
	protected.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr1.Code)
	}

	// With user in context
	ctx := context.WithValue(context.Background(), UserContextKey, &model.User{ID: "usr_1"})
	req2 := httptest.NewRequest(http.MethodGet, "/protected", nil).WithContext(ctx)
	rr2 := httptest.NewRecorder()
	protected.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr2.Code)
	}
}
