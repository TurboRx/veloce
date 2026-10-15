package flow

import (
	"context"
	"testing"
	"time"

	"github.com/diamondburned/arikawa/v3/discord"
)

func TestFlowExecutionWithVariables(t *testing.T) {
	data := FlowData{
		Nodes: []FlowNode{
			{
				ID:   "entry",
				Type: FlowNodeTypeEntryCommand,
				Data: FlowNodeData{Name: "greet"},
			},
			{
				ID:   "set-prefix",
				Type: FlowNodeTypeActionVariableSet,
				Data: FlowNodeData{
					VariableName:  "greeting",
					VariableValue: "Welcome",
				},
			},
			{
				ID:   "response",
				Type: FlowNodeTypeActionResponseCreate,
				Data: FlowNodeData{
					ResponseContent: "{{var('greeting')}}, {{user.username}}!",
				},
			},
		},
		Edges: []FlowEdge{
			{ID: "e1", Source: "entry", Target: "set-prefix"},
			{ID: "e2", Source: "set-prefix", Target: "response"},
		},
	}

	compiled, err := CompileCommand(data)
	if err != nil {
		t.Fatalf("failed to compile command: %v", err)
	}

	interaction := &discord.InteractionEvent{
		ID: discord.InteractionID(1001),
		User: &discord.User{
			ID:       discord.UserID(2002),
			Username: "Alex",
		},
		Data: &discord.CommandInteraction{
			Name: "greet",
		},
	}

	ctx := NewFlowContext(context.Background(), 5*time.Second, nil, interaction)
	if err := compiled.Execute(ctx); err != nil {
		t.Fatalf("failed to execute flow: %v", err)
	}

	// Verify variable was set
	v := ctx.GetVariable("greeting")
	if v.String() != "Welcome" {
		t.Fatalf("expected variable greeting to be Welcome, got %s", v.String())
	}

	// Verify node result
	res := ctx.GetNodeResult("response")
	expected := "Welcome, Alex!"
	if res.String() != expected {
		t.Fatalf("expected response '%s', got '%s'", expected, res.String())
	}
}

func TestFlowExecutionBranching(t *testing.T) {
	data := FlowData{
		Nodes: []FlowNode{
			{
				ID:   "entry",
				Type: FlowNodeTypeEntryCommand,
				Data: FlowNodeData{Name: "check"},
			},
			{
				ID:   "branch",
				Type: FlowNodeTypeControlBranch,
				Data: FlowNodeData{
					ConditionExpression: "arg('score') >= 50",
				},
			},
			{
				ID:   "pass-act",
				Type: FlowNodeTypeActionResponseCreate,
				Data: FlowNodeData{
					ResponseContent: "Passed!",
				},
			},
			{
				ID:   "fail-act",
				Type: FlowNodeTypeActionResponseCreate,
				Data: FlowNodeData{
					ResponseContent: "Failed!",
				},
			},
		},
		Edges: []FlowEdge{
			{ID: "e1", Source: "entry", Target: "branch"},
			{ID: "e2", Source: "branch", Target: "pass-act", SourceHandle: "true"},
			{ID: "e3", Source: "branch", Target: "fail-act", SourceHandle: "false"},
		},
	}

	compiled, err := CompileCommand(data)
	if err != nil {
		t.Fatalf("compile error: %v", err)
	}

	// Test Branch True (score 80)
	iPass := &discord.InteractionEvent{
		ID: discord.InteractionID(100),
		Data: &discord.CommandInteraction{
			Name: "check",
			Options: []discord.CommandInteractionOption{
				{
					Name:  "score",
					Type:  discord.IntegerOptionType,
					Value: []byte("80"),
				},
			},
		},
	}

	ctxPass := NewFlowContext(context.Background(), 5*time.Second, nil, iPass)
	if err := compiled.Execute(ctxPass); err != nil {
		t.Fatalf("execution error: %v", err)
	}
	if ctxPass.GetNodeResult("pass-act").String() != "Passed!" {
		t.Fatalf("expected 'Passed!', got '%s'", ctxPass.GetNodeResult("pass-act").String())
	}
	if ctxPass.GetNodeResult("fail-act").String() != "" {
		t.Fatalf("expected fail-act to not run on true branch")
	}

	// Test Branch False (score 30)
	iFail := &discord.InteractionEvent{
		ID: discord.InteractionID(101),
		Data: &discord.CommandInteraction{
			Name: "check",
			Options: []discord.CommandInteractionOption{
				{
					Name:  "score",
					Type:  discord.IntegerOptionType,
					Value: []byte("30"),
				},
			},
		},
	}

	ctxFail := NewFlowContext(context.Background(), 5*time.Second, nil, iFail)
	if err := compiled.Execute(ctxFail); err != nil {
		t.Fatalf("execution error: %v", err)
	}
	if ctxFail.GetNodeResult("fail-act").String() != "Failed!" {
		t.Fatalf("expected 'Failed!', got '%s'", ctxFail.GetNodeResult("fail-act").String())
	}
	if ctxFail.GetNodeResult("pass-act").String() != "" {
		t.Fatalf("expected pass-act to not run on false branch")
	}
}

func TestFlowStackDepthCycleProtection(t *testing.T) {
	// Build an infinite cycle nodeA -> nodeB -> nodeA
	nodeA := &CompiledFlowNode{
		ID:       "nodeA",
		Type:     FlowNodeTypeEntryCommand,
		Children: newConnectedFlowNodes(),
	}
	nodeB := &CompiledFlowNode{
		ID:       "nodeB",
		Type:     FlowNodeTypeActionVariableSet,
		Data:     FlowNodeData{VariableName: "x", VariableValue: "1"},
		Children: newConnectedFlowNodes(),
	}
	nodeA.Children.Default = []*CompiledFlowNode{nodeB}
	nodeB.Children.Default = []*CompiledFlowNode{nodeA}

	ctx := NewFlowContext(context.Background(), 5*time.Second, nil, nil)
	err := nodeA.Execute(ctx)
	if err == nil {
		t.Fatal("expected cycle to trigger max recursion stack depth limit, got nil error")
	}
}
