package model

import (
	"encoding/json"
	"time"
)

type App struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Description          *string         `json:"description,omitempty"`
	Enabled              bool            `json:"enabled"`
	OwnerUserID          string          `json:"owner_user_id"`
	CreatorUserID        string          `json:"creator_user_id"`
	DiscordToken         string          `json:"-"` // Never expose token in JSON
	DiscordID            string          `json:"discord_id"`
	DiscordAvatar        *string         `json:"discord_avatar,omitempty"`
	DiscordStatus        json.RawMessage `json:"discord_status,omitempty"`
	CommandsDeployAt     *time.Time      `json:"commands_deploy_at,omitempty"`
	CommandsDeployedHash *string         `json:"commands_deployed_hash,omitempty"`
	CommandsDeployError  json.RawMessage `json:"commands_deploy_error,omitempty"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}
