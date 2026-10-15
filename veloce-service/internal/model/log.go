package model

import (
	"time"
)

type LogLevel string

const (
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type Log struct {
	ID        int64          `json:"id"`
	AppID     string         `json:"app_id"`
	Message   string         `json:"message"`
	Level     LogLevel       `json:"level"`
	Details   map[string]any `json:"details,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}
