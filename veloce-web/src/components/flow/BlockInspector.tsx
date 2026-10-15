import React from "react";
import { Sliders, Trash2, HelpCircle } from "lucide-react";
import { FlowNodeData } from "@/lib/api";
import { Node } from "@xyflow/react";

interface BlockInspectorProps {
  selectedNode: Node<any> | null;
  onUpdateNodeData: (nodeId: string, newData: Partial<FlowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function BlockInspector({
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
}: BlockInspectorProps) {
  if (!selectedNode) {
    return (
      <aside className="w-80 border-l border-slate-800 bg-slate-900/50 p-6 flex flex-col items-center justify-center text-center hidden lg:flex">
        <div className="p-3 rounded-full bg-slate-800 text-slate-500 mb-3">
          <Sliders className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-slate-300">No Block Selected</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
          Click any block on the flow canvas to configure its properties and logic.
        </p>
      </aside>
    );
  }

  const { id, type, data } = selectedNode;
  const isEntry = type === "entry_command";

  const handleChange = (field: keyof FlowNodeData, value: any) => {
    onUpdateNodeData(id, { [field]: value });
  };

  return (
    <aside className="w-80 border-l border-slate-800 bg-slate-900/50 p-5 flex flex-col justify-between overflow-y-auto hidden lg:flex">
      <div className="space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>BLOCK INSPECTOR</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            {type}
          </span>
        </div>

        {/* Dynamic Fields by Type */}
        {type === "entry_command" && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">
                Command Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-500 font-mono">/</span>
                <input
                  type="text"
                  value={data?.data?.name || ""}
                  onChange={(e) =>
                    handleChange("name", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                  }
                  placeholder="ping"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">1-32 lowercase characters, numbers, and dashes.</p>
            </div>

            <div>
              <label className="text-slate-300 font-medium block mb-1">
                Command Description <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={data?.data?.description || ""}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Brief summary shown in Discord slash autocomplete"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        )}

        {type === "action_response_create" && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Response Message</label>
              <textarea
                rows={4}
                value={data?.data?.response_content || ""}
                onChange={(e) => handleChange("response_content", e.target.value)}
                placeholder="Pong! Hello {user.username}."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 resize-none"
              />
              <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                <HelpCircle className="w-3 h-3" />
                <span>Supports expressions: {"{user.id}"}, {"{user.username}"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Ephemeral Response</span>
                <span className="text-[10px] text-slate-500">Only visible to the user who invoked it</span>
              </div>
              <input
                type="checkbox"
                checked={!!data?.data?.response_ephemeral}
                onChange={(e) => handleChange("response_ephemeral", e.target.checked)}
                className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </div>
          </div>
        )}

        {type === "action_message_create" && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Target Channel ID</label>
              <input
                type="text"
                value={data?.data?.message_channel_id || ""}
                onChange={(e) => handleChange("message_channel_id", e.target.value)}
                placeholder="1029384756..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-300 font-medium block mb-1">Message Content</label>
              <textarea
                rows={4}
                value={data?.data?.message_content || ""}
                onChange={(e) => handleChange("message_content", e.target.value)}
                placeholder="Log message sent to channel..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        )}

        {type === "control_branch" && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">
                Condition Expression <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={data?.data?.condition_expression || ""}
                onChange={(e) => handleChange("condition_expression", e.target.value)}
                placeholder="user.id == '123' || has_role('Admin')"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500 resize-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Evaluates in Go expression engine. Connect True / False handles.
              </p>
            </div>
          </div>
        )}

        {type === "control_delay" && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Delay Duration (Seconds)</label>
              <input
                type="number"
                min={1}
                max={300}
                value={data?.data?.delay_seconds || 1}
                onChange={(e) => handleChange("delay_seconds", parseInt(e.target.value, 10) || 1)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {type === "action_variable_set" && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Variable Name</label>
              <input
                type="text"
                value={data?.data?.variable_name || ""}
                onChange={(e) => handleChange("variable_name", e.target.value)}
                placeholder="counter"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">Variable Value</label>
              <input
                type="text"
                value={data?.data?.variable_value || ""}
                onChange={(e) => handleChange("variable_value", e.target.value)}
                placeholder="100 or {user.username}"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Delete Node Action */}
      {!isEntry && (
        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={() => onDeleteNode(id)}
            className="w-full py-2 px-3 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Block
          </button>
        </div>
      )}
    </aside>
  );
}
