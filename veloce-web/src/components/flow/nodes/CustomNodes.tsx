import React from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { Terminal, Send, GitFork, Clock, Database, MessageSquare, Zap } from "lucide-react";
import { FlowNodeData } from "@/lib/api";

export type FlowCustomNode = Node<{ data: FlowNodeData }>;

export function EntryEventNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[200px] shadow-xl transition-all ${
        selected ? "border-amber-400 ring-2 ring-amber-400/20" : "border-amber-500/40 hover:border-amber-500"
      }`}
    >
      <div className="bg-amber-950/60 px-3 py-1.5 border-b border-amber-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold tracking-wider">
          <Zap className="w-3.5 h-3.5" />
          <span>EVENT LISTENER</span>
        </div>
        <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Event</span>
      </div>
      <div className="p-3">
        <div className="text-sm font-bold text-slate-100 font-mono capitalize">
          {nodeData?.event_type || nodeData?.name || "message_create"}
        </div>
        <div className="text-xs text-slate-400 mt-1 line-clamp-2">
          {nodeData?.description || "Triggers when event occurs"}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export function EntryCommandNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[200px] shadow-xl transition-all ${
        selected ? "border-emerald-400 ring-2 ring-emerald-400/20" : "border-emerald-500/40 hover:border-emerald-500"
      }`}
    >
      <div className="bg-emerald-950/60 px-3 py-1.5 border-b border-emerald-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold tracking-wider">
          <Terminal className="w-3.5 h-3.5" />
          <span>SLASH COMMAND</span>
        </div>
        <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">Entry</span>
      </div>
      <div className="p-3">
        <div className="text-base font-bold text-slate-100 font-mono">/{nodeData?.name || "command"}</div>
        <div className="text-xs text-slate-400 mt-1 line-clamp-2">
          {nodeData?.description || "No description provided"}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export function ActionResponseCreateNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[220px] max-w-[280px] shadow-xl transition-all ${
        selected ? "border-cyan-400 ring-2 ring-cyan-400/20" : "border-cyan-500/40 hover:border-cyan-500"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="default"
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900"
      />
      <div className="bg-cyan-950/60 px-3 py-1.5 border-b border-cyan-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-semibold tracking-wider">
          <Send className="w-3.5 h-3.5" />
          <span>REPLY INTERACTION</span>
        </div>
        {nodeData?.response_ephemeral && (
          <span className="text-[9px] font-semibold uppercase bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded">
            Ephemeral
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800 line-clamp-3">
          {nodeData?.response_content || "(empty reply)"}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export function ActionMessageCreateNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[220px] max-w-[280px] shadow-xl transition-all ${
        selected ? "border-blue-400 ring-2 ring-blue-400/20" : "border-blue-500/40 hover:border-blue-500"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="default"
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-slate-900"
      />
      <div className="bg-blue-950/60 px-3 py-1.5 border-b border-blue-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold tracking-wider">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>SEND MESSAGE</span>
        </div>
      </div>
      <div className="p-3">
        {nodeData?.message_channel_id && (
          <div className="text-[10px] text-slate-400 mb-1 font-mono">
            Channel: <span className="text-slate-300">{nodeData.message_channel_id}</span>
          </div>
        )}
        <div className="text-xs text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800 line-clamp-3">
          {nodeData?.message_content || "(empty message)"}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export function ControlBranchNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[220px] max-w-[280px] shadow-xl transition-all ${
        selected ? "border-indigo-400 ring-2 ring-indigo-400/20" : "border-indigo-500/40 hover:border-indigo-500"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="default"
        className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-slate-900"
      />
      <div className="bg-indigo-950/60 px-3 py-1.5 border-b border-indigo-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold tracking-wider">
          <GitFork className="w-3.5 h-3.5" />
          <span>CONDITION BRANCH</span>
        </div>
      </div>
      <div className="p-3">
        <div className="text-xs text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800 line-clamp-2">
          {nodeData?.condition_expression || "true"}
        </div>
      </div>
      {/* Dual output handles for True and False branches */}
      <div className="flex justify-between px-4 pb-2 text-[10px] font-bold">
        <span className="text-emerald-400">TRUE</span>
        <span className="text-rose-400">FALSE</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!left-[25%] !w-3 !h-3 !bg-emerald-400 !border-2 !border-slate-900"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!left-[75%] !w-3 !h-3 !bg-rose-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export function ControlDelayNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[180px] shadow-xl transition-all ${
        selected ? "border-amber-400 ring-2 ring-amber-400/20" : "border-amber-500/40 hover:border-amber-500"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="default"
        className="!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-900"
      />
      <div className="bg-amber-950/60 px-3 py-1.5 border-b border-amber-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold tracking-wider">
          <Clock className="w-3.5 h-3.5" />
          <span>DELAY</span>
        </div>
      </div>
      <div className="p-3 text-center">
        <span className="text-lg font-bold text-slate-100 font-mono">{nodeData?.delay_seconds || 1}s</span>
        <span className="text-xs text-slate-400 ml-1">pause</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export function ActionVariableSetNode({ data, selected }: NodeProps<FlowCustomNode>) {
  const nodeData = data?.data;
  return (
    <div
      className={`rounded-xl bg-slate-900 border-2 min-w-[200px] shadow-xl transition-all ${
        selected ? "border-purple-400 ring-2 ring-purple-400/20" : "border-purple-500/40 hover:border-purple-500"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="default"
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-slate-900"
      />
      <div className="bg-purple-950/60 px-3 py-1.5 border-b border-purple-500/30 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center gap-1.5 text-purple-400 text-xs font-semibold tracking-wider">
          <Database className="w-3.5 h-3.5" />
          <span>SET VARIABLE</span>
        </div>
      </div>
      <div className="p-3">
        <div className="text-xs font-mono text-purple-300 truncate">
          ${nodeData?.variable_name || "var"} = {nodeData?.variable_value || "value"}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-slate-900"
      />
    </div>
  );
}
