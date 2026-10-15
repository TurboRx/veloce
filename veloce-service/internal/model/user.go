package model

import "time"

type User struct {
	ID              string    `json:"id"`
	Email           string    `json:"email"`
	DisplayName     string    `json:"display_name"`
	DiscordID       string    `json:"discord_id"`
	DiscordUsername string    `json:"discord_username"`
	DiscordAvatar   *string   `json:"discord_avatar"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
