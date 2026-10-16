package flow

import (
	"testing"

	"github.com/diamondburned/arikawa/v3/discord"
)

func TestCompileCommandValid(t *testing.T) {
	data := FlowData{
		Nodes: []FlowNode{
			{
				ID:   "entry-1",
				Type: FlowNodeTypeEntryCommand,
				Data: FlowNodeData{
					Name:        "ping",
					Description: "Check bot latency",
				},
			},
			{
				ID:   "arg-1",
				Type: FlowNodeTypeOptionCommandArgument,
				Data: FlowNodeData{
					Name:                    "detailed",
					Description:             "Show detailed metrics",
					CommandArgumentType:     CommandArgumentTypeBoolean,
					CommandArgumentRequired: false,
				},
			},
			{
				ID:   "arg-2",
				Type: FlowNodeTypeOptionCommandArgument,
				Data: FlowNodeData{
					Name:                    "format",
					Description:             "Output format",
					CommandArgumentType:     CommandArgumentTypeString,
					CommandArgumentRequired: false,
					CommandArgumentChoices: []CommandArgumentChoice{
						{Name: "JSON", Value: "json"},
						{Name: "Text", Value: "text"},
					},
				},
			},
			{
				ID:   "action-1",
				Type: FlowNodeTypeActionResponseCreate,
				Data: FlowNodeData{
					ResponseContent: "Pong! {{user.username}}",
				},
			},
		},
		Edges: []FlowEdge{
			{
				ID:     "edge-arg1",
				Source: "arg-1",
				Target: "entry-1",
			},
			{
				ID:     "edge-arg2",
				Source: "arg-2",
				Target: "entry-1",
			},
			{
				ID:     "edge-action",
				Source: "entry-1",
				Target: "action-1",
			},
		},
	}

	compiled, err := CompileCommand(data)
	if err != nil {
		t.Fatalf("failed to compile valid command: %v", err)
	}

	if compiled.Data.Name != "ping" {
		t.Fatalf("expected command name ping, got %s", compiled.Data.Name)
	}

	cmdData := compiled.CommandData()
	if cmdData.Name != "ping" || cmdData.Description != "Check bot latency" {
		t.Fatalf("unexpected command data: %+v", cmdData)
	}

	if len(cmdData.Options) != 2 {
		t.Fatalf("expected 2 command options, got %d", len(cmdData.Options))
	}

	boolOpt, ok := cmdData.Options[0].(*discord.BooleanOption)
	if !ok || boolOpt.OptionName != "detailed" {
		t.Fatalf("expected detailed boolean option, got %+v", cmdData.Options[0])
	}

	strOpt, ok := cmdData.Options[1].(*discord.StringOption)
	if !ok || strOpt.OptionName != "format" || len(strOpt.Choices) != 2 {
		t.Fatalf("expected format string option with 2 choices, got %+v", cmdData.Options[1])
	}
}

func TestCompileCommandValidationErrors(t *testing.T) {
	// Empty nodes
	_, err := CompileCommand(FlowData{})
	if err == nil {
		t.Fatal("expected error for empty nodes")
	}

	// Missing entry_command
	_, err = CompileCommand(FlowData{
		Nodes: []FlowNode{
			{ID: "act-1", Type: FlowNodeTypeActionResponseCreate},
		},
	})
	if err == nil {
		t.Fatal("expected error for missing entry_command")
	}

	// Invalid command name
	_, err = CompileCommand(FlowData{
		Nodes: []FlowNode{
			{
				ID:   "entry-1",
				Type: FlowNodeTypeEntryCommand,
				Data: FlowNodeData{Name: "INVALID NAME!"},
			},
		},
	})
	if err == nil {
		t.Fatal("expected error for invalid command name with spaces and capitals")
	}
}

func TestCompileEventListener(t *testing.T) {
	// Valid event listener flow
	data := FlowData{
		Nodes: []FlowNode{
			{
				ID:   "entry-event-1",
				Type: FlowNodeTypeEntryEvent,
				Data: FlowNodeData{
					Name:        "welcome",
					Description: "Send welcome message",
					EventType:   "guild_member_add",
				},
			},
			{
				ID:   "action-msg-1",
				Type: FlowNodeTypeActionMessageCreate,
				Data: FlowNodeData{
					MessageContent:   "Welcome {{user.mention}} to the server!",
					MessageChannelID: "123456789",
				},
			},
		},
		Edges: []FlowEdge{
			{
				ID:     "edge-1",
				Source: "entry-event-1",
				Target: "action-msg-1",
			},
		},
	}

	compiled, err := CompileEventListener(data)
	if err != nil {
		t.Fatalf("failed to compile valid event listener flow: %v", err)
	}

	if compiled.ID != "entry-event-1" {
		t.Fatalf("expected compiled root id entry-event-1, got %s", compiled.ID)
	}
	if len(compiled.Children.Default) != 1 {
		t.Fatalf("expected 1 child, got %d", len(compiled.Children.Default))
	}
	if compiled.Children.Default[0].ID != "action-msg-1" {
		t.Fatalf("expected child action-msg-1, got %s", compiled.Children.Default[0].ID)
	}

	// Missing entry_event
	_, err = CompileEventListener(FlowData{
		Nodes: []FlowNode{
			{ID: "node-1", Type: FlowNodeTypeActionMessageCreate},
		},
	})
	if err == nil {
		t.Fatal("expected error for missing entry_event node")
	}

	// Multiple entry_event
	_, err = CompileEventListener(FlowData{
		Nodes: []FlowNode{
			{ID: "e1", Type: FlowNodeTypeEntryEvent},
			{ID: "e2", Type: FlowNodeTypeEntryEvent},
		},
	})
	if err == nil {
		t.Fatal("expected error for multiple entry_event nodes")
	}
}
