package postgres

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

type Client struct {
	DB *sql.DB
}

func New(dsn string, maxOpenConns int) (*Client, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	if maxOpenConns <= 0 {
		maxOpenConns = 25
	}

	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(maxOpenConns / 2)
	db.SetConnMaxLifetime(1 * time.Hour)
	db.SetConnMaxIdleTime(15 * time.Minute)

	return &Client{DB: db}, nil
}

func (c *Client) Ping() error {
	return c.DB.Ping()
}

func (c *Client) Close() error {
	return c.DB.Close()
}
