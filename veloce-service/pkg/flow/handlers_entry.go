package flow

func init() {
	RegisterHandler(FlowNodeTypeEntryCommand, executeEntryCommand)
	RegisterHandler(FlowNodeTypeEntryEvent, executeEntryEvent)
	RegisterHandler(FlowNodeTypeEntryComponentButton, executeEntryButton)
}

func executeEntryCommand(n *CompiledFlowNode, ctx *FlowContext) error {
	return n.ExecuteChildren(ctx)
}

func executeEntryEvent(n *CompiledFlowNode, ctx *FlowContext) error {
	return n.ExecuteChildren(ctx)
}

func executeEntryButton(n *CompiledFlowNode, ctx *FlowContext) error {
	return n.ExecuteChildren(ctx)
}
