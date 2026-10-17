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
  EntryEventNode,
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
      entry_event: EntryEventNode as any,
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
      className="w-full h-full bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl relative"
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
        fitViewOptions={{
          padding: 0.35,
          maxZoom: 1.0,
          minZoom: 0.2,
        }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        panOnScroll={false}
        panOnDrag={true}
        zoomOnPinch={true}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Controls
          showInteractive={false}
          className="hidden md:flex bg-slate-900 border border-slate-800 text-slate-300 rounded-xl shadow-lg overflow-hidden"
        />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="hidden md:block bg-slate-900/90 border border-slate-800 rounded-xl"
        />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#334155" />
      </ReactFlow>
    </div>
  );
}
