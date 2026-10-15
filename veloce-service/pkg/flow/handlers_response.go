package flow

import (
	"fmt"

	"github.com/TurboRx/veloce/veloce-service/pkg/thing"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/utils/json/option"
)

func init() {
	RegisterHandler(FlowNodeTypeActionResponseCreate, executeActionResponseCreate)
	RegisterHandler(FlowNodeTypeActionResponseDefer, executeActionResponseDefer)
	RegisterHandler(FlowNodeTypeActionResponseEdit, executeActionResponseEdit)
	RegisterHandler(FlowNodeTypeActionResponseDelete, executeActionResponseDelete)
}

func executeActionResponseCreate(n *CompiledFlowNode, ctx *FlowContext) error {
	content, err := ctx.EvalString(n.Data.ResponseContent)
	if err != nil {
		return fmt.Errorf("failed to evaluate response content: %w", err)
	}

	var flags discord.MessageFlags
	if n.Data.ResponseEphemeral {
		flags |= discord.EphemeralMessage
	}

	if ctx.Interaction != nil && ctx.Session != nil {
		if !ctx.HasResponded() {
			resp := api.InteractionResponse{
				Type: api.MessageInteractionWithSource,
				Data: &api.InteractionResponseData{
					Content: option.NewNullableString(content),
					Flags:   flags,
				},
			}
			err := ctx.Session.RespondInteraction(ctx.Interaction.ID, ctx.Interaction.Token, resp)
			if err != nil {
				return fmt.Errorf("failed to respond to interaction: %w", err)
			}
			ctx.MarkResponded()
		} else {
			followup := api.InteractionResponseData{
				Content: option.NewNullableString(content),
				Flags:   flags,
			}
			_, err := ctx.Session.FollowUpInteraction(ctx.Interaction.AppID, ctx.Interaction.Token, followup)
			if err != nil {
				return fmt.Errorf("failed to send followup interaction: %w", err)
			}
		}
	}

	ctx.SetNodeResult(n.ID, thing.NewString(content))
	return n.ExecuteChildren(ctx)
}

func executeActionResponseDefer(n *CompiledFlowNode, ctx *FlowContext) error {
	var flags discord.MessageFlags
	if n.Data.ResponseEphemeral {
		flags |= discord.EphemeralMessage
	}

	if ctx.Interaction != nil && ctx.Session != nil && !ctx.HasResponded() {
		resp := api.InteractionResponse{
			Type: api.DeferredMessageInteractionWithSource,
			Data: &api.InteractionResponseData{
				Flags: flags,
			},
		}
		if err := ctx.Session.RespondInteraction(ctx.Interaction.ID, ctx.Interaction.Token, resp); err != nil {
			return fmt.Errorf("failed to defer interaction: %w", err)
		}
		ctx.MarkResponded()
	}

	return n.ExecuteChildren(ctx)
}

func executeActionResponseEdit(n *CompiledFlowNode, ctx *FlowContext) error {
	content, err := ctx.EvalString(n.Data.ResponseContent)
	if err != nil {
		return fmt.Errorf("failed to evaluate edit content: %w", err)
	}

	if ctx.Interaction != nil && ctx.Session != nil {
		data := api.EditInteractionResponseData{
			Content: option.NewNullableString(content),
		}
		_, err := ctx.Session.EditInteractionResponse(ctx.Interaction.AppID, ctx.Interaction.Token, data)
		if err != nil {
			return fmt.Errorf("failed to edit interaction response: %w", err)
		}
	}

	ctx.SetNodeResult(n.ID, thing.NewString(content))
	return n.ExecuteChildren(ctx)
}

func executeActionResponseDelete(n *CompiledFlowNode, ctx *FlowContext) error {
	if ctx.Interaction != nil && ctx.Session != nil {
		if err := ctx.Session.DeleteInteractionResponse(ctx.Interaction.AppID, ctx.Interaction.Token); err != nil {
			return fmt.Errorf("failed to delete interaction response: %w", err)
		}
	}
	return n.ExecuteChildren(ctx)
}
