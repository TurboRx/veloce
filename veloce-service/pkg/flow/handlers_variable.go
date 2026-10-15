package flow

import (
	"fmt"

	"github.com/TurboRx/veloce/veloce-service/pkg/thing"
)

func init() {
	RegisterHandler(FlowNodeTypeActionVariableSet, executeActionVariableSet)
}

func executeActionVariableSet(n *CompiledFlowNode, ctx *FlowContext) error {
	val, err := ctx.EvalString(n.Data.VariableValue)
	if err != nil {
		return fmt.Errorf("failed to evaluate variable value for '%s': %w", n.Data.VariableName, err)
	}

	ctx.SetVariable(n.Data.VariableName, thing.NewString(val))
	return n.ExecuteChildren(ctx)
}
