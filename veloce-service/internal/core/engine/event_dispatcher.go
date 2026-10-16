package engine

import (
	"context"
	"log/slog"
	"slices"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/model"
	"github.com/TurboRx/veloce/veloce-service/internal/store"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type EventDispatcher struct {
	listenerStore store.EventListenerStore
	logStore      store.LogStore
}

func NewEventDispatcher(listenerStore store.EventListenerStore, logStore ...store.LogStore) *EventDispatcher {
	d := &EventDispatcher{
		listenerStore: listenerStore,
	}
	if len(logStore) > 0 {
		d.logStore = logStore[0]
	}
	return d
}

// HandleEvent handles incoming Discord gateway events and routes them to active event listeners.
func (d *EventDispatcher) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	eventType, channelID, guildID, userID, isBot := d.classifyEvent(session, event)
	if eventType == "" {
		return
	}

	listeners, err := d.listenerStore.ListEnabledEventListenersByAppAndType(ctx, appID, eventType)
	if err != nil {
		slog.Error("Failed to list event listeners",
			slog.String("app_id", appID),
			slog.String("event_type", string(eventType)),
			slog.String("error", err.Error()),
		)
		return
	}

	if len(listeners) == 0 {
		return
	}

	for _, l := range listeners {
		if !d.passesFilter(l.Filter, channelID, isBot) {
			continue
		}

		go d.executeListener(ctx, appID, session, event, l, eventType, channelID, guildID, userID)
	}
}

func (d *EventDispatcher) classifyEvent(
	session *state.State,
	event gateway.Event,
) (eventType model.EventListenerType, channelID discord.ChannelID, guildID discord.GuildID, userID discord.UserID, isBot bool) {
	var botID discord.UserID
	if session != nil {
		botID = session.Ready().User.ID
	}

	switch e := event.(type) {
	case *gateway.MessageCreateEvent:
		channelID = e.ChannelID
		guildID = e.GuildID
		userID = e.Author.ID
		isBot = e.Author.Bot

		if isBoostMessage(e.Message) {
			eventType = model.EventListenerTypeDiscordGuildBoost
		} else {
			if isBot {
				return "", 0, 0, 0, true
			}
			eventType = model.EventListenerTypeDiscordMessageCreate
		}

	case *gateway.MessageUpdateEvent:
		channelID = e.ChannelID
		guildID = e.GuildID
		userID = e.Author.ID
		isBot = e.Author.Bot

		if isBot {
			return "", 0, 0, 0, true
		}
		eventType = model.EventListenerTypeDiscordMessageUpdate

	case *gateway.MessageDeleteEvent:
		channelID = e.ChannelID
		guildID = e.GuildID
		eventType = model.EventListenerTypeDiscordMessageDelete

	case *gateway.GuildMemberAddEvent:
		guildID = e.GuildID
		userID = e.User.ID
		isBot = e.User.Bot
		eventType = model.EventListenerTypeDiscordGuildMemberAdd

	case *gateway.GuildMemberRemoveEvent:
		guildID = e.GuildID
		userID = e.User.ID
		isBot = e.User.Bot
		eventType = model.EventListenerTypeDiscordGuildMemberRemove

	case *gateway.MessageReactionAddEvent:
		if botID.IsValid() && e.UserID == botID {
			return "", 0, 0, 0, false
		}
		channelID = e.ChannelID
		guildID = e.GuildID
		userID = e.UserID
		eventType = model.EventListenerTypeDiscordMessageReactionAdd

	case *gateway.MessageReactionRemoveEvent:
		if botID.IsValid() && e.UserID == botID {
			return "", 0, 0, 0, false
		}
		channelID = e.ChannelID
		guildID = e.GuildID
		userID = e.UserID
		eventType = model.EventListenerTypeDiscordMessageReactionRemove

	case *gateway.GuildCreateEvent:
		guildID = e.ID
		eventType = model.EventListenerTypeDiscordGuildCreate

	case *gateway.GuildDeleteEvent:
		guildID = e.ID
		eventType = model.EventListenerTypeDiscordGuildDelete
	}

	return eventType, channelID, guildID, userID, isBot
}

func (d *EventDispatcher) passesFilter(filter *model.EventListenerFilter, channelID discord.ChannelID, isBot bool) bool {
	if filter == nil {
		return true
	}

	if filter.IgnoreBots != nil && *filter.IgnoreBots && isBot {
		return false
	}

	if len(filter.Channels) > 0 && channelID.IsValid() {
		if !slices.Contains(filter.Channels, channelID.String()) {
			return false
		}
	}

	return true
}

func (d *EventDispatcher) executeListener(
	parentCtx context.Context,
	appID string,
	session *state.State,
	event gateway.Event,
	l *model.EventListener,
	eventType model.EventListenerType,
	channelID discord.ChannelID,
	guildID discord.GuildID,
	userID discord.UserID,
) {
	compiled, err := flow.CompileEventListener(l.FlowSource)
	if err != nil {
		slog.Error("Failed to compile event listener flow",
			slog.String("app_id", appID),
			slog.String("event_listener_id", l.ID),
			slog.String("error", err.Error()),
		)
		d.recordLog(appID, "Failed compiling flow for event "+string(eventType)+": "+err.Error(), model.LogLevelError, map[string]any{
			"event_listener_id": l.ID,
			"event_type":        string(eventType),
			"status":            "compile_error",
			"error":             err.Error(),
		})
		return
	}

	flowCtx := flow.NewFlowEventContext(parentCtx, 30*time.Second, session, event)
	start := time.Now()
	execErr := compiled.Execute(flowCtx)
	duration := time.Since(start)

	_ = d.listenerStore.UpdateLastRun(context.Background(), l.ID)

	details := map[string]any{
		"event_listener_id": l.ID,
		"event_type":        string(eventType),
		"duration_ms":       duration.Milliseconds(),
		"status":            "success",
	}
	if channelID.IsValid() {
		details["channel_id"] = channelID.String()
	}
	if guildID.IsValid() {
		details["guild_id"] = guildID.String()
	}
	if userID.IsValid() {
		details["user_id"] = userID.String()
	}

	if execErr != nil {
		details["status"] = "error"
		details["error"] = execErr.Error()
		slog.Error("Event listener execution failed",
			slog.String("app_id", appID),
			slog.String("event_listener_id", l.ID),
			slog.String("event_type", string(eventType)),
			slog.String("error", execErr.Error()),
		)
		d.recordLog(appID, "Failed executing event "+string(eventType)+": "+execErr.Error(), model.LogLevelError, details)
	} else {
		d.recordLog(appID, "Successfully executed event "+string(eventType), model.LogLevelInfo, details)
	}
}

func (d *EventDispatcher) recordLog(appID, message string, level model.LogLevel, details map[string]any) {
	if d.logStore == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = d.logStore.CreateLog(ctx, &model.Log{
			AppID:     appID,
			Message:   message,
			Level:     level,
			Details:   details,
			CreatedAt: time.Now().UTC(),
		})
	}()
}

func isBoostMessage(msg discord.Message) bool {
	switch msg.Type {
	case discord.NitroBoostMessage,
		discord.NitroTier1Message,
		discord.NitroTier2Message,
		discord.NitroTier3Message:
		return true
	}
	return false
}
