package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/knadh/koanf/parsers/toml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)


type Config struct {
	Server     ServerConfig     `koanf:"server"`
	Database   DatabaseConfig   `koanf:"database"`
	Storage    StorageConfig    `koanf:"storage"`
	Encryption EncryptionConfig `koanf:"encryption"`
	Discord    DiscordConfig    `koanf:"discord"`
	Gateway    GatewayConfig    `koanf:"gateway"`
}

type ServerConfig struct {
	Host          string `koanf:"host"`
	Port          int    `koanf:"port"`
	PublicBaseURL string `koanf:"public_base_url"`
}

type DatabaseConfig struct {
	Host     string `koanf:"host"`
	Port     int    `koanf:"port"`
	User     string `koanf:"user"`
	Password string `koanf:"password"`
	Database string `koanf:"database"`
	SSLMode  string `koanf:"ssl_mode"`
	URL      string `koanf:"url"`
}

type StorageConfig struct {
	Endpoint        string `koanf:"endpoint"`
	AccessKeyID     string `koanf:"access_key_id"`
	SecretAccessKey string `koanf:"secret_access_key"`
	Bucket          string `koanf:"bucket"`
	UseSSL          bool   `koanf:"use_ssl"`
}

type EncryptionConfig struct {
	TokenEncryptionKey string `koanf:"token_encryption_key"`
}

type DiscordConfig struct {
	ClientID     string `koanf:"client_id"`
	ClientSecret string `koanf:"client_secret"`
	RedirectURI  string `koanf:"redirect_uri"`
}

type GatewayConfig struct {
	Enabled      bool `koanf:"enabled"`
	ClusterCount int  `koanf:"cluster_count"`
	ClusterIndex int  `koanf:"cluster_index"`
}

func (d *DatabaseConfig) DSN() string {
	if d.URL != "" {
		return d.URL
	}
	if envURL := os.Getenv("DATABASE_URL"); envURL != "" {
		return envURL
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		d.User, d.Password, d.Host, d.Port, d.Database, d.SSLMode)
}


func Load(path string) (*Config, error) {
	k := koanf.New(".")

	// Defaults
	defaults := map[string]any{
		"server.host":            "0.0.0.0",
		"server.port":            8080,
		"server.public_base_url": "http://localhost:8080",
		"database.host":          "localhost",
		"database.port":          5432,
		"database.user":          "postgres",
		"database.password":      "veloce_dev_password",
		"database.database":      "veloce",
		"database.ssl_mode":      "disable",
		"storage.endpoint":       "localhost:9000",
		"storage.bucket":         "veloce-assets",
		"storage.use_ssl":        false,
		"gateway.enabled":        true,
		"gateway.cluster_count":  1,
		"gateway.cluster_index":  0,
	}

	for key, val := range defaults {
		_ = k.Set(key, val)
	}

	// File config if present
	if path != "" {
		if err := k.Load(file.Provider(path), toml.Parser()); err != nil {
			// If file was explicitly provided and failed, surface error
			return nil, fmt.Errorf("failed to load config file: %w", err)
		}
	} else {
		// Attempt reading default veloce.toml if it exists
		_ = k.Load(file.Provider("veloce.toml"), toml.Parser())
		_ = k.Load(file.Provider("../veloce.toml"), toml.Parser())
	}

	// Environment variable overrides: VELOCE_SERVER__PORT -> server.port
	err := k.Load(env.Provider("VELOCE_", ".", func(s string) string {
		s = strings.TrimPrefix(s, "VELOCE_")
		s = strings.ToLower(s)
		s = strings.ReplaceAll(s, "__", ".")
		return s
	}), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to load environment variables: %w", err)
	}

	var cfg Config
	if err := k.Unmarshal("", &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Standard cloud environment variable overrides
	if portStr := os.Getenv("PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			cfg.Server.Port = p
		}
	}
	if pubURL := os.Getenv("PUBLIC_BASE_URL"); pubURL != "" {
		cfg.Server.PublicBaseURL = pubURL
	} else if renderURL := os.Getenv("RENDER_EXTERNAL_URL"); renderURL != "" {
		cfg.Server.PublicBaseURL = renderURL
	}
	if encKey := os.Getenv("TOKEN_ENCRYPTION_KEY"); encKey != "" {
		cfg.Encryption.TokenEncryptionKey = encKey
	}
	if dID := os.Getenv("DISCORD_CLIENT_ID"); dID != "" {
		cfg.Discord.ClientID = dID
	}
	if dSecret := os.Getenv("DISCORD_CLIENT_SECRET"); dSecret != "" {
		cfg.Discord.ClientSecret = dSecret
	}
	if dRedirect := os.Getenv("DISCORD_REDIRECT_URI"); dRedirect != "" {
		cfg.Discord.RedirectURI = dRedirect
	}

	return &cfg, nil
}

