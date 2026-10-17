import React from "react";
import { X } from "lucide-react";
import { FlowNodeType } from "@/lib/api";
import { PALETTE_GROUPS } from "./BlockPalette";

interface FlowMobileAddBlockModalProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: FlowNodeType) => void;
}

export function FlowMobileAddBlockModal({
  open,
  onClose,
  onSelectType,
}: FlowMobileAddBlockModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-100">Add Block</h3>
            <p className="text-[11px] text-slate-400">Tap any block to add it to your flow.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto py-3 space-y-4 flex-1">
          {PALETTE_GROUPS.map((group) => (
            <div key={group.name} className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {group.name}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        onSelectType(item.type);
                        onClose();
                      }}
                      className={`w-full p-2.5 rounded-xl bg-slate-950 border ${item.colorClass} text-left flex items-center gap-3 transition hover:bg-slate-850 active:scale-[0.98]`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-slate-200">{item.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.subtitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
