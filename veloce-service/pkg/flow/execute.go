package flow

import (
	"fmt"
)

type nodeHandler func(*CompiledFlowNode, *FlowContext) error

var nodeHandlers = make(map[FlowNodeType]nodeHandler)

func RegisterHandler(nodeType FlowNodeType, handler nodeHandler) {
	nodeHandlers[nodeType] = handler
}

func (n *CompiledFlowNode) Execute(ctx *FlowContext) error {
	if n == nil {
		return fmt.Errorf("cannot execute nil node")
	}

	if err := ctx.StartOperation(); err != nil {
		return err
	}
	defer ctx.EndOperation()

	handler, ok := nodeHandlers[n.Type]
	if !ok {
		return fmt.Errorf("unknown flow node type: %s", n.Type)
	}

	return handler(n, ctx)
}
