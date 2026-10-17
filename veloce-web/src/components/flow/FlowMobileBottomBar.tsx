import React from "react";
import { Plus, Sliders, X, Maximize2, Activity, Server } from "lucide-react";
import { Node } from "@xyflow/react";

interface FlowMobileBottomBarProps {
  selectedNode: Node<any> | null;
  onAddBlockClick: () => void;
  onEditNodeClick: () => void;
  onDeselectNode: () => void;
  onFitView: () => void;
  onOpenLogs?: () => void;
  onOpenServers?: () => void;
  hasApp: boolean;
}

export function FlowMobileBottomBar({
  selectedNode,
  onAddBlockClick,
  onEditNodeClick,
  onDeselectNode,
  onFitView,
  onOpenLogs,
  onOpenServers,
  hasApp,
}: FlowMobileBottomBarProps) {
  const nodeTypeLabel = selectedNode?.type?.replace(/^(entry_|action_|control_)/, "").replace(/_/g, " ") || "Block";

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 py-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2 shadow-2xl select-none">
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={onAddBlockClick}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Block</span>
        </button>

        {selectedNode && (
          <div className="flex items-center gap-1 bg-slate-950/80 rounded-full pl-2.5 pr-1 py-0.5 border border-indigo-500/40 min-w-0 max-w-[150px]">
            <button
              type="button"
              onClick={onEditNodeClick}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-200 truncate"
              title="Edit block properties"
            >
              <Sliders className="w-3 h-3 text-indigo-400 flex-shrink-0" />
              <span className="truncate capitalize">{nodeTypeLabel}</span>
            </button>
            <button
              type="button"
              onClick={onDeselectNode}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-full flex-shrink-0"
              title="Deselect block"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-full border border-slate-800/80 flex-shrink-0">
        <button
          type="button"
          onClick={onFitView}
          className="p-1.5 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          title="Fit to screen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {hasApp && onOpenLogs && (
          <button
            type="button"
            onClick={onOpenLogs}
            className="p-1.5 rounded-full text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition"
            title="Execution logs"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        )}

        {hasApp && onOpenServers && (
          <button
            type="button"
            onClick={onOpenServers}
            className="p-1.5 rounded-full text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition"
            title="Connected servers"
          >
            <Server className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
