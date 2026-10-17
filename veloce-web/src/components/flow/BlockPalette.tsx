import { Terminal, Send, MessageSquare, GitFork, Clock, Database, Zap } from "lucide-react";
import { FlowNodeType } from "@/lib/api";

export interface PaletteItem {
  type: FlowNodeType;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

export const PALETTE_GROUPS: { name: string; items: PaletteItem[] }[] = [
  {
    name: "Entry & Triggers",
    items: [
      {
        type: "entry_event",
        title: "Event Listener",
        subtitle: "Discord gateway event",
        icon: Zap,
        colorClass: "border-amber-500/40 text-amber-400 hover:border-amber-400",
      },
    ],
  },
  {
    name: "Actions",
    items: [
      {
        type: "action_response_create",
        title: "Reply Interaction",
        subtitle: "Immediate response to user",
        icon: Send,
        colorClass: "border-cyan-500/40 text-cyan-400 hover:border-cyan-400",
      },
      {
        type: "action_message_create",
        title: "Send Message",
        subtitle: "Post to text channel",
        icon: MessageSquare,
        colorClass: "border-blue-500/40 text-blue-400 hover:border-blue-400",
      },
    ],
  },
  {
    name: "Logic & Flow",
    items: [
      {
        type: "control_branch",
        title: "Condition Check",
        subtitle: "Branch True / False",
        icon: GitFork,
        colorClass: "border-indigo-500/40 text-indigo-400 hover:border-indigo-400",
      },
      {
        type: "control_delay",
        title: "Delay Timer",
        subtitle: "Pause execution seconds",
        icon: Clock,
        colorClass: "border-amber-500/40 text-amber-400 hover:border-amber-400",
      },
    ],
  },
  {
    name: "Variables & State",
    items: [
      {
        type: "action_variable_set",
        title: "Set Variable",
        subtitle: "Assign custom key-value",
        icon: Database,
        colorClass: "border-purple-500/40 text-purple-400 hover:border-purple-400",
      },
    ],
  },
];

interface BlockPaletteProps {
  onAddNode: (type: FlowNodeType) => void;
}

export function BlockPalette({ onAddNode }: BlockPaletteProps) {
  const onDragStart = (event: React.DragEvent, nodeType: FlowNodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-5 overflow-y-auto hidden md:flex">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 tracking-wider">
        <span>BLOCK PALETTE</span>
      </div>

      <div className="space-y-6">
        {PALETTE_GROUPS.map((group) => (
          <div key={group.name} className="space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {group.name}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, item.type)}
                  onClick={() => onAddNode(item.type)}
                  className={`p-2.5 rounded-lg bg-slate-900 border ${item.colorClass} text-xs flex items-center gap-2.5 cursor-pointer hover:bg-slate-850 transition select-none shadow-sm`}
                  title="Click to add or drag to canvas"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="overflow-hidden">
                    <div className="font-medium text-slate-200 truncate">{item.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.subtitle}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
