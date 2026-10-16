package model

import (
	"time"

	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
)

type EventSource string

const (
	EventSourceDiscord  EventSource = "discord"
	EventSourceSchedule EventSource = "schedule"
	EventSourceWebhook  EventSource = "webhook"
)

type EventListenerType string

const (
	EventListenerTypeDiscordMessageCreate         EventListenerType = "message_create"
	EventListenerTypeDiscordMessageUpdate         EventListenerType = "message_update"
	EventListenerTypeDiscordMessageDelete         EventListenerType = "message_delete"
	EventListenerTypeDiscordGuildMemberAdd        EventListenerType = "guild_member_add"
	EventListenerTypeDiscordGuildMemberRemove     EventListenerType = "guild_member_remove"
	EventListenerTypeDiscordMessageReactionAdd    EventListenerType = "message_reaction_add"
	EventListenerTypeDiscordMessageReactionRemove EventListenerType = "message_reaction_remove"
	EventListenerTypeDiscordGuildCreate           EventListenerType = "guild_create"
	EventListenerTypeDiscordGuildDelete           EventListenerType = "guild_delete"
	EventListenerTypeDiscordGuildBoost            EventListenerType = "guild_boost"
)

type EventListenerFilter struct {
	Channels   []string `json:"channels,omitempty"`
	Roles      []string `json:"roles,omitempty"`
	IgnoreBots *bool    `json:"ignore_bots,omitempty"`
}

type EventListener struct {
	ID            string               `json:"id"`
	Source        EventSource          `json:"source"`
	Type          EventListenerType    `json:"type"`
	Description   string               `json:"description"`
	Enabled       bool                 `json:"enabled"`
	AppID         string               `json:"app_id"`
	CreatorUserID string               `json:"creator_user_id"`
	Filter        *EventListenerFilter `json:"filter,omitempty"`
	FlowSource    flow.FlowData        `json:"flow_source"`
	WebhookSecret *string              `json:"webhook_secret,omitempty"`
	LastRunAt     *time.Time           `json:"last_run_at,omitempty"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
}
