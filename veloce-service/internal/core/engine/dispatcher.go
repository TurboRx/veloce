package engine

import (
	"context"
	"log/slog"
	"time"

	"github.com/TurboRx/veloce/veloce-service/internal/store"
	"github.com/TurboRx/veloce/veloce-service/pkg/flow"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type InteractionDispatcher struct {
	commandStore store.CommandStore
}

func NewInteractionDispatcher(commandStore store.CommandStore) *InteractionDispatcher {
	return &InteractionDispatcher{
		commandStore: commandStore,
	}
}

// HandleEvent processes incoming Discord gateway events and executes matching flows.
func (d *InteractionDispatcher) HandleEvent(ctx context.Context, appID string, session *state.State, event gateway.Event) {
	switch e := event.(type) {
	case *gateway.InteractionCreateEvent:
		d.handleInteraction(ctx, appID, session, e)
	}
}

func (d *InteractionDispatcher) handleInteraction(
	parentCtx context.Context,
	appID string,
	session *state.State,
	e *gateway.InteractionCreateEvent,
) {
	if e.Data == nil || e.Data.InteractionType() != discord.CommandInteractionType {
		return
	}

	cmdData, ok := e.Data.(*discord.CommandInteraction)
	if !ok {
		return
	}

	commands, err := d.commandStore.ListEnabledCommandsByApp(parentCtx, appID)
	if err != nil {
		slog.Error("Failed to list commands for interaction",
			slog.String("app_id", appID),
			slog.String("error", err.Error()),
		)
		return
	}

	for _, cmd := range commands {
		if cmd.Name == cmdData.Name {
			compiled, err := flow.CompileCommand(cmd.FlowSource)
			if err != nil {
				slog.Error("Failed to compile command flow for execution",
					slog.String("app_id", appID),
					slog.String("command_name", cmd.Name),
					slog.String("error", err.Error()),
				)
				return
			}

			// Flow execution context with 30s max execution window
			flowCtx := flow.NewFlowContext(parentCtx, 30*time.Second, session, &e.InteractionEvent)

			// Auto-defer interaction before Discord's 3-second deadline if still executing
			autoDeferTimer := time.AfterFunc(2300*time.Millisecond, func() {
				if !flowCtx.HasResponded() && session != nil {
					resp := api.InteractionResponse{
						Type: api.DeferredMessageInteractionWithSource,
					}
					if err := session.RespondInteraction(e.ID, e.Token, resp); err == nil {
						flowCtx.MarkResponded()
					}
				}
			})
			defer autoDeferTimer.Stop()

			if err := compiled.Execute(flowCtx); err != nil {
				slog.Error("Flow execution failed",
					slog.String("app_id", appID),
					slog.String("command_name", cmd.Name),
					slog.String("error", err.Error()),
				)
			}
			return
		}
	}
}
