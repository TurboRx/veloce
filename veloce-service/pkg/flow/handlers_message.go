package flow

import (
	"fmt"
	"strconv"

	"github.com/TurboRx/veloce/veloce-service/pkg/thing"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
)

func init() {
	RegisterHandler(FlowNodeTypeActionMessageCreate, executeActionMessageCreate)
	RegisterHandler(FlowNodeTypeActionMessageDelete, executeActionMessageDelete)
}

func executeActionMessageCreate(n *CompiledFlowNode, ctx *FlowContext) error {
	content, err := ctx.EvalString(n.Data.MessageContent)
	if err != nil {
		return fmt.Errorf("failed to evaluate message content: %w", err)
	}

	channelIDStr, err := ctx.EvalString(n.Data.MessageChannelID)
	if err != nil {
		return fmt.Errorf("failed to evaluate channel ID: %w", err)
	}

	var channelID discord.ChannelID
	if channelIDStr != "" {
		id, _ := strconv.ParseInt(channelIDStr, 10, 64)
		channelID = discord.ChannelID(id)
	} else if ctx.Interaction != nil {
		channelID = ctx.Interaction.ChannelID
	}

	if ctx.Session != nil && channelID != 0 {
		msg, err := ctx.Session.SendMessage(channelID, content)
		if err != nil {
			return fmt.Errorf("failed to send message to channel %s: %w", channelID, err)
		}
		if msg != nil {
			ctx.SetNodeResult(n.ID, thing.NewDiscordMessage(*msg))
		}
	} else {
		ctx.SetNodeResult(n.ID, thing.NewString(content))
	}

	return n.ExecuteChildren(ctx)
}

func executeActionMessageDelete(n *CompiledFlowNode, ctx *FlowContext) error {
	// Delete previous message result if present
	result := ctx.GetNodeResult(n.ID)
	if ctx.Session != nil && result.Type == thing.TypeDiscordMessage {
		msg := result.DiscordMessage()
		if msg.ID != 0 && msg.ChannelID != 0 {
			_ = ctx.Session.DeleteMessage(msg.ChannelID, msg.ID, api.AuditLogReason("Flow execution delete message"))
		}
	}
	return n.ExecuteChildren(ctx)
}
