import React, { useCallback } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from "@xyflow/react";
import { Terminal, Send, GitFork } from "lucide-react";

const initialNodes: Node[] = [
  {
    id: "1",
    type: "input",
    data: {
      label: (
        <div className="flex items-center gap-2 p-1">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="font-semibold text-xs text-emerald-400">COMMAND ENTRY</div>
            <div className="text-sm">/ping</div>
          </div>
        </div>
      ),
    },
    position: { x: 100, y: 150 },
    className: "bg-slate-900 border-2 border-emerald-500/50 text-white rounded-lg p-2 shadow-lg min-w-[180px]",
  },
  {
    id: "2",
    data: {
      label: (
        <div className="flex items-center gap-2 p-1">
          <GitFork className="w-4 h-4 text-indigo-400" />
          <div>
            <div className="font-semibold text-xs text-indigo-400">CONDITION</div>
            <div className="text-sm">Has Role: Admin</div>
          </div>
        </div>
      ),
    },
    position: { x: 360, y: 150 },
    className: "bg-slate-900 border-2 border-indigo-500/50 text-white rounded-lg p-2 shadow-lg min-w-[180px]",
  },
  {
    id: "3",
    type: "output",
    data: {
      label: (
        <div className="flex items-center gap-2 p-1">
          <Send className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="font-semibold text-xs text-cyan-400">ACTION</div>
            <div className="text-sm">Send Pong (Secret)</div>
          </div>
        </div>
      ),
    },
    position: { x: 640, y: 90 },
    className: "bg-slate-900 border-2 border-cyan-500/50 text-white rounded-lg p-2 shadow-lg min-w-[200px]",
  },
  {
    id: "4",
    type: "output",
    data: {
      label: (
        <div className="flex items-center gap-2 p-1">
          <Send className="w-4 h-4 text-rose-400" />
          <div>
            <div className="font-semibold text-xs text-rose-400">ACTION</div>
            <div className="text-sm">Send Permission Error</div>
          </div>
        </div>
      ),
    },
    position: { x: 640, y: 220 },
    className: "bg-slate-900 border-2 border-rose-500/50 text-white rounded-lg p-2 shadow-lg min-w-[200px]",
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true, style: { stroke: "#10b981", strokeWidth: 2 } },
  { id: "e2-3", source: "2", target: "3", label: "True", style: { stroke: "#6366f1", strokeWidth: 2 } },
  { id: "e2-4", source: "2", target: "4", label: "False", style: { stroke: "#f43f5e", strokeWidth: 2 } },
];

export function FlowCanvas() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-2xl relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
