package model

import (
	"time"

	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
)

type Command struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	Description    string        `json:"description"`
	Enabled        bool          `json:"enabled"`
	AppID          string        `json:"app_id"`
	CreatorUserID  string        `json:"creator_user_id"`
	FlowSource     flow.FlowData `json:"flow_source"`
	CreatedAt      time.Time     `json:"created_at"`
	UpdatedAt      time.Time     `json:"updated_at"`
	LastDeployedAt *time.Time    `json:"last_deployed_at,omitempty"`
}
