package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/TurboRx/veloce/veloce-service/internal/core/gateway"
	"github.com/TurboRx/veloce/veloce-service/internal/store"
	"github.com/TurboRx/veloce/veloce-service/internal/util"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

type GatewayInspector interface {
	GetAppStatus(appID string) gateway.GatewayAppStatus
	ListGuilds(appID string) ([]discord.Guild, error)
}

type Server struct {
	config           *config.Config
	router           *mux.Router
	http             *http.Server
	userStore        store.UserStore
	sessionStore     store.SessionStore
	appStore         store.AppStore
	commandStore     store.CommandStore
	logStore         store.LogStore
	gatewayInspector GatewayInspector
	tokenCrypt       *util.SymmetricCrypt
	botVerifier      util.BotTokenVerifier
}

func NewServer(
	cfg *config.Config,
	userStore store.UserStore,
	sessionStore store.SessionStore,
	appStore store.AppStore,
	commandStore store.CommandStore,
	tokenCrypt *util.SymmetricCrypt,
	botVerifier util.BotTokenVerifier,
) *Server {
	r := mux.NewRouter()

	if botVerifier == nil {
		botVerifier = util.NewBotTokenVerifier()
	}

	s := &Server{
		config:       cfg,
		router:       r,
		userStore:    userStore,
		sessionStore: sessionStore,
		appStore:     appStore,
		commandStore: commandStore,
		tokenCrypt:   tokenCrypt,
		botVerifier:  botVerifier,
	}

	if sessionStore != nil {
		r.Use(AuthMiddleware(sessionStore))
	}

	s.registerRoutes(r)

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", cfg.Server.PublicBaseURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	s.http = &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      c.Handler(r),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

func (s *Server) SetLogStore(ls store.LogStore) {
	s.logStore = ls
}

func (s *Server) SetGatewayInspector(gi GatewayInspector) {
	s.gatewayInspector = gi
}

func (s *Server) Start() error {
	slog.Info("Starting Veloce API HTTP server", slog.Int("port", s.config.Server.Port))
	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start server: %w", err)
	}
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	slog.Info("Shutting down Veloce API HTTP server")
	return s.http.Shutdown(ctx)
}
