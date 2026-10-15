package flow

import (
	"errors"
	"fmt"

	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
)

type ConnectedFlowNodes struct {
	Default []*CompiledFlowNode
	Handles map[string][]*CompiledFlowNode
}

func newConnectedFlowNodes() ConnectedFlowNodes {
	return ConnectedFlowNodes{
		Default: make([]*CompiledFlowNode, 0),
		Handles: make(map[string][]*CompiledFlowNode),
	}
}

type CompiledFlowNode struct {
	ID       string
	Type     FlowNodeType
	Data     FlowNodeData
	Parents  ConnectedFlowNodes
	Children ConnectedFlowNodes
}

func CompileCommand(data FlowData) (*CompiledFlowNode, error) {
	if len(data.Nodes) == 0 {
		return nil, errors.New("cannot compile empty flow: no nodes found")
	}

	var entryNode *CompiledFlowNode
	nodeMap := make(map[string]*CompiledFlowNode, len(data.Nodes))

	for _, n := range data.Nodes {
		compiled := &CompiledFlowNode{
			ID:       n.ID,
			Type:     n.Type,
			Data:     n.Data,
			Parents:  newConnectedFlowNodes(),
			Children: newConnectedFlowNodes(),
		}
		nodeMap[n.ID] = compiled

		if n.Type == FlowNodeTypeEntryCommand {
			if entryNode != nil {
				return nil, errors.New("flow cannot have multiple command entry nodes")
			}
			entryNode = compiled
		}
	}

	if entryNode == nil {
		return nil, errors.New("flow must contain an entry_command node")
	}

	if !commandNameRe.MatchString(entryNode.Data.Name) {
		return nil, fmt.Errorf("invalid command name '%s': must be 1-32 lowercase characters, numbers, or dashes/underscores", entryNode.Data.Name)
	}

	// Link edges
	for _, edge := range data.Edges {
		parent, ok := nodeMap[edge.Source]
		if !ok {
			continue
		}
		child, ok := nodeMap[edge.Target]
		if !ok {
			continue
		}

		if edge.SourceHandle == "" || edge.SourceHandle == "default" {
			parent.Children.Default = append(parent.Children.Default, child)
		} else {
			parent.Children.Handles[edge.SourceHandle] = append(parent.Children.Handles[edge.SourceHandle], child)
		}

		if edge.TargetHandle == "" || edge.TargetHandle == "default" {
			child.Parents.Default = append(child.Parents.Default, parent)
		} else {
			child.Parents.Handles[edge.TargetHandle] = append(child.Parents.Handles[edge.TargetHandle], parent)
		}
	}

	return entryNode, nil
}

func (n *CompiledFlowNode) CommandData() api.CreateCommandData {
	cmd := api.CreateCommandData{
		Name:        n.Data.Name,
		Description: n.Data.Description,
	}

	if n.Data.Permissions != 0 {
		cmd.DefaultMemberPermissions = discord.NewPermissions(discord.Permissions(n.Data.Permissions))
	}

	options := make(discord.CommandOptions, 0)
	for _, p := range n.Parents.Default {
		if p.Type == FlowNodeTypeOptionCommandArgument {
			opt := createCommandOption(p)
			if opt != nil {
				options = append(options, opt)
			}
		}
	}

	if len(options) > 0 {
		cmd.Options = options
	}

	return cmd
}

func createCommandOption(n *CompiledFlowNode) discord.CommandOption {
	switch n.Data.CommandArgumentType {
	case CommandArgumentTypeString:
		choices := make([]discord.StringChoice, 0, len(n.Data.CommandArgumentChoices))
		for _, c := range n.Data.CommandArgumentChoices {
			choices = append(choices, discord.StringChoice{
				Name:  c.Name,
				Value: c.Value,
			})
		}
		return &discord.StringOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
			Choices:     choices,
		}
	case CommandArgumentTypeInteger:
		return &discord.IntegerOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	case CommandArgumentTypeBoolean:
		return &discord.BooleanOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	case CommandArgumentTypeUser:
		return &discord.UserOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	case CommandArgumentTypeChannel:
		return &discord.ChannelOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	case CommandArgumentTypeRole:
		return &discord.RoleOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	case CommandArgumentTypeMentionable:
		return &discord.MentionableOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	case CommandArgumentTypeNumber:
		return &discord.NumberOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	default:
		return &discord.StringOption{
			OptionName:  n.Data.Name,
			Description: n.Data.Description,
			Required:    n.Data.CommandArgumentRequired,
		}
	}
}

func (n *CompiledFlowNode) ExecuteChildren(ctx *FlowContext) error {
	for _, child := range n.Children.Default {
		if err := child.Execute(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (n *CompiledFlowNode) ExecuteChildrenByHandle(ctx *FlowContext, handle string) error {
	children, ok := n.Children.Handles[handle]
	if !ok {
		return nil
	}
	for _, child := range children {
		if err := child.Execute(ctx); err != nil {
			return err
		}
	}
	return nil
}
