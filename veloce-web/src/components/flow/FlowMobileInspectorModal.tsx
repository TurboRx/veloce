import React from "react";
import { Node } from "@xyflow/react";
import { FlowNodeData } from "@/lib/api";
import { BlockFields } from "./BlockInspector";

interface FlowMobileInspectorModalProps {
  open: boolean;
  onClose: () => void;
  selectedNode: Node<any> | null;
  onUpdateNodeData: (nodeId: string, newData: Partial<FlowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function FlowMobileInspectorModal({
  open,
  onClose,
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
}: FlowMobileInspectorModalProps) {
  if (!open || !selectedNode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 lg:hidden">
      <div className="w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 shadow-2xl flex flex-col overflow-y-auto">
        <BlockFields
          selectedNode={selectedNode}
          onUpdateNodeData={onUpdateNodeData}
          onDeleteNode={(id) => {
            onDeleteNode(id);
            onClose();
          }}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
