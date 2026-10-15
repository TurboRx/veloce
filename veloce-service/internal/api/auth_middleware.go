package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/store"
)

type contextKey string

const (
	UserContextKey    contextKey = "veloce_user"
	SessionContextKey contextKey = "veloce_session"
	CookieSessionName string     = "veloce_session"
)

func GetUserFromContext(ctx context.Context) *model.User {
	if val := ctx.Value(UserContextKey); val != nil {
		if u, ok := val.(*model.User); ok {
			return u
		}
	}
	return nil
}

func ExtractToken(r *http.Request) string {
	// 1. Check Authorization header
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}

	// 2. Check Cookie
	if cookie, err := r.Cookie(CookieSessionName); err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}

func AuthMiddleware(sessionStore store.SessionStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := ExtractToken(r)
			if token == "" {
				next.ServeHTTP(w, r)
				return
			}

			sess, user, err := sessionStore.GetSessionByKey(r.Context(), token)
			if err != nil || sess == nil || user == nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), UserContextKey, user)
			ctx = context.WithValue(ctx, SessionContextKey, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := GetUserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized","message":"Authentication required"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}
