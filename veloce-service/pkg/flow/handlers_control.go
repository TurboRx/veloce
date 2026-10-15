package flow

import (
	"fmt"
	"time"
)

func init() {
	RegisterHandler(FlowNodeTypeControlBranch, executeControlBranch)
	RegisterHandler(FlowNodeTypeControlDelay, executeControlDelay)
}

func executeControlBranch(n *CompiledFlowNode, ctx *FlowContext) error {
	conditionResult, err := ctx.EvalCondition(n.Data.ConditionExpression)
	if err != nil {
		return fmt.Errorf("failed to evaluate branch condition '%s': %w", n.Data.ConditionExpression, err)
	}

	if conditionResult {
		// Follow true handle if connected, otherwise fallback to default
		if len(n.Children.Handles["true"]) > 0 {
			return n.ExecuteChildrenByHandle(ctx, "true")
		}
		return n.ExecuteChildren(ctx)
	}

	// Follow false handle if connected
	if len(n.Children.Handles["false"]) > 0 {
		return n.ExecuteChildrenByHandle(ctx, "false")
	}

	return nil
}

func executeControlDelay(n *CompiledFlowNode, ctx *FlowContext) error {
	delay := time.Duration(n.Data.DelaySeconds) * time.Second
	if delay > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}

	return n.ExecuteChildren(ctx)
}
