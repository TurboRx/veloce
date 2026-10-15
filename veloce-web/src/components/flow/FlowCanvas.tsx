import React, { useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  NodeTypes,
} from "@xyflow/react";
import {
  EntryCommandNode,
  ActionResponseCreateNode,
  ActionMessageCreateNode,
  ControlBranchNode,
  ControlDelayNode,
  ActionVariableSetNode,
} from "./nodes/CustomNodes";

interface FlowCanvasProps {
  nodes: Node<any>[];
  edges: Edge[];
  onNodesChange: OnNodesChange<any>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node<any>) => void;
  onPaneClick: () => void;
  onDrop?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
  onDrop,
  onDragOver,
}: FlowCanvasProps) {
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      entry_command: EntryCommandNode as any,
      action_response_create: ActionResponseCreateNode as any,
      action_message_create: ActionMessageCreateNode as any,
      control_branch: ControlBranchNode as any,
      control_delay: ControlDelayNode as any,
      action_variable_set: ActionVariableSetNode as any,
    }),
    []
  );

  return (
    <div
      className="w-full h-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-2xl relative"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
      >
        <Controls className="bg-slate-900 border border-slate-700 text-white rounded shadow-md" />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="bg-slate-900 border border-slate-800 rounded"
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
      </ReactFlow>
    </div>
  );
}
