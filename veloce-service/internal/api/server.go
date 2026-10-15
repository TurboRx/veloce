package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/config"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

type Server struct {
	config *config.Config
	router *mux.Router
	http   *http.Server
}

func NewServer(cfg *config.Config) *Server {
	r := mux.NewRouter()

	s := &Server{
		config: cfg,
		router: r,
	}

	s.registerRoutes(r)

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", cfg.Server.PublicBaseURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(LoggingMiddleware(r))

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	s.http = &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

func (s *Server) Start() error {
	slog.Info("Veloce API Server listening",
		slog.String("addr", s.http.Addr),
		slog.String("public_url", s.config.Server.PublicBaseURL),
	)
	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("http server failed: %w", err)
	}
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	slog.Info("Shutting down API server...")
	return s.http.Shutdown(ctx)
}
