package flow

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/TurboRx/veloce/veloce-service/pkg/eval"
	"github.com/TurboRx/veloce/veloce-service/pkg/thing"
	"github.com/diamondburned/arikawa/v3/api"
	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
)

type FlowContext struct {
	context.Context
	Cancel context.CancelFunc

	Session      *state.State
	Interaction  *discord.InteractionEvent
	HTTPResponse *api.InteractionResponse
	EvalCtx      eval.Context

	mu          sync.RWMutex
	variables   map[string]thing.Thing
	nodeResults map[string]thing.Thing

	hasResponded bool
	stackDepth   int
	maxStack     int
	operations   int
	maxOps       int
}


func NewFlowContext(
	ctx context.Context,
	timeout time.Duration,
	session *state.State,
	interaction *discord.InteractionEvent,
) *FlowContext {
	ctx, cancel := context.WithTimeout(ctx, timeout)

	var evalCtx eval.Context
	if interaction != nil {
		evalCtx = eval.NewContextFromInteraction(interaction, session)
	} else {
		evalCtx = eval.Context{Env: make(eval.Env)}
	}

	fc := &FlowContext{
		Context:     ctx,
		Cancel:      cancel,
		Session:     session,
		Interaction: interaction,
		EvalCtx:     evalCtx,
		variables:   make(map[string]thing.Thing),
		nodeResults: make(map[string]thing.Thing),
		maxStack:    100,
		maxOps:      1000,
	}

	// Dynamic context getters for variable lookups and preceding node results
	fc.EvalCtx.Env["var"] = func(name string) any {
		fc.mu.RLock()
		defer fc.mu.RUnlock()
		if val, ok := fc.variables[name]; ok {
			return val.Value
		}
		return nil
	}

	fc.EvalCtx.Env["result"] = func(nodeID string) any {
		fc.mu.RLock()
		defer fc.mu.RUnlock()
		if val, ok := fc.nodeResults[nodeID]; ok {
			return val.Value
		}
		return nil
	}

	return fc
}

func NewFlowEventContext(
	ctx context.Context,
	timeout time.Duration,
	session *state.State,
	event gateway.Event,
) *FlowContext {
	ctx, cancel := context.WithTimeout(ctx, timeout)

	evalCtx := eval.NewContextFromGatewayEvent(event, session)
	fc := &FlowContext{
		Context:     ctx,
		Cancel:      cancel,
		Session:     session,
		EvalCtx:     evalCtx,
		variables:   make(map[string]thing.Thing),
		nodeResults: make(map[string]thing.Thing),
		maxStack:    100,
		maxOps:      1000,
	}

	fc.EvalCtx.Env["var"] = func(name string) any {
		fc.mu.RLock()
		defer fc.mu.RUnlock()
		if val, ok := fc.variables[name]; ok {
			return val.Value
		}
		return nil
	}

	fc.EvalCtx.Env["result"] = func(nodeID string) any {
		fc.mu.RLock()
		defer fc.mu.RUnlock()
		if val, ok := fc.nodeResults[nodeID]; ok {
			return val.Value
		}
		return nil
	}

	return fc
}

func (c *FlowContext) SetVariable(name string, val thing.Thing) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.variables[name] = val
}

func (c *FlowContext) GetVariable(name string) thing.Thing {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if val, ok := c.variables[name]; ok {
		return val
	}
	return thing.Null
}

func (c *FlowContext) SetNodeResult(nodeID string, val thing.Thing) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.nodeResults[nodeID] = val
}

func (c *FlowContext) GetNodeResult(nodeID string) thing.Thing {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if val, ok := c.nodeResults[nodeID]; ok {
		return val
	}
	return thing.Null
}

func (c *FlowContext) MarkResponded() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.hasResponded = true
}

func (c *FlowContext) HasResponded() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.hasResponded
}

func (c *FlowContext) SetHTTPResponse(resp api.InteractionResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.HTTPResponse == nil {
		c.HTTPResponse = &resp
		c.hasResponded = true
	}
}

func (c *FlowContext) GetHTTPResponse() *api.InteractionResponse {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.HTTPResponse
}


func (c *FlowContext) StartOperation() error {
	if c.Err() != nil {
		return c.Err()
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.operations++
	if c.operations > c.maxOps {
		return fmt.Errorf("flow exceeded maximum allowed operations (%d)", c.maxOps)
	}

	c.stackDepth++
	if c.stackDepth > c.maxStack {
		return fmt.Errorf("flow exceeded maximum recursion stack depth (%d)", c.maxStack)
	}

	return nil
}

func (c *FlowContext) EndOperation() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stackDepth > 0 {
		c.stackDepth--
	}
}

func (c *FlowContext) EvalString(template string) (string, error) {
	return eval.EvalTemplateToString(c.Context, template, c.EvalCtx)
}

func (c *FlowContext) EvalCondition(expr string) (bool, error) {
	res, err := eval.Eval(c.Context, expr, c.EvalCtx)
	if err != nil {
		return false, err
	}
	return res.Bool(), nil
}
