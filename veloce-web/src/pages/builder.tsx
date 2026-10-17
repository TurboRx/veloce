import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Play,
  Plus,
  Terminal,
  Bot,
  Trash2,
  Loader2,
  Activity,
  Server,
  Zap,
  MoreVertical,
  UserPlus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from "@xyflow/react";
import { toast } from "sonner";
import { FlowCanvas } from "@/components/flow/FlowCanvas";
import { BlockPalette } from "@/components/flow/BlockPalette";
import { BlockInspector } from "@/components/flow/BlockInspector";
import { FlowMobileBottomBar } from "@/components/flow/FlowMobileBottomBar";
import { FlowMobileAddBlockModal } from "@/components/flow/FlowMobileAddBlockModal";
import { FlowMobileInspectorModal } from "@/components/flow/FlowMobileInspectorModal";
import { ExecutionLogsModal } from "@/components/telemetry/ExecutionLogsModal";
import { GuildsModal } from "@/components/telemetry/GuildsModal";
import { AuthBarrier } from "@/components/auth/AuthBarrier";
import { ThemeSwitch } from "@/components/common/ThemeSwitch";
import { useCurrentUser } from "@/lib/useAuth";
import {
  api,
  getAppInviteUrl,
  App,
  Command,
  EventListener,
  FlowNodeType,
  FlowNodeData,
  FlowData,
  GatewayStatus,
} from "@/lib/api";

const defaultInitialNodes: Node[] = [
  {
    id: "node_entry_1",
    type: "entry_command",
    data: {
      data: {
        name: "ping",
        description: "Replies with pong and server latency.",
      },
    },
    position: { x: 250, y: 100 },
  },
  {
    id: "node_reply_1",
    type: "action_response_create",
    data: {
      data: {
        response_content: "Pong! 🏓 Hello {user.username}!",
        response_ephemeral: true,
      },
    },
    position: { x: 250, y: 280 },
  },
];

const defaultInitialEdges: Edge[] = [
  {
    id: "edge_1",
    source: "node_entry_1",
    target: "node_reply_1",
    sourceHandle: "default",
    style: { stroke: "#10b981", strokeWidth: 2 },
  },
];

function BuilderContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { app: queryAppId, cmd: queryCmdId } = router.query;
  const { fitView } = useReactFlow();

  const { data: user, isLoading: authLoading } = useCurrentUser();

  const [mode, setMode] = useState<"command" | "event">("command");
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [selectedCmdId, setSelectedCmdId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalTab, setCreateModalTab] = useState<"command" | "event">("command");
  const [newCmdName, setNewCmdName] = useState("");
  const [newCmdDesc, setNewCmdDesc] = useState("");
  const [newEventType, setNewEventType] = useState("message_create");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [guildsModalOpen, setGuildsModalOpen] = useState(false);

  // Mobile drawer states
  const [mobileAddModalOpen, setMobileAddModalOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(defaultInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(defaultInitialEdges);

  // Gateway status query
  const { data: gatewayStatus } = useQuery<GatewayStatus | null>({
    queryKey: ["app-gateway-status", selectedAppId],
    queryFn: () => (selectedAppId ? api.getGatewayStatus(selectedAppId) : Promise.resolve(null)),
    enabled: !!selectedAppId && !!user,
    refetchInterval: 10000,
  });

  // 1. Fetch apps
  const { data: apps, isLoading: appsLoading } = useQuery<App[]>({
    queryKey: ["apps-list"],
    queryFn: () => api.listApps(),
    enabled: !!user,
  });

  // Automatically select app from query or first available
  useEffect(() => {
    if (apps && apps.length > 0) {
      if (queryAppId && typeof queryAppId === "string" && apps.some((a) => a.id === queryAppId)) {
        setSelectedAppId(queryAppId);
      } else if (!selectedAppId) {
        setSelectedAppId(apps[0].id);
      }
    }
  }, [apps, queryAppId]);

  // 2. Fetch commands for selected app
  const {
    data: commands,
    isLoading: commandsLoading,
  } = useQuery<Command[]>({
    queryKey: ["commands-list", selectedAppId],
    queryFn: () => (selectedAppId ? api.listCommands(selectedAppId) : Promise.resolve([])),
    enabled: !!selectedAppId && !!user,
  });

  // 3. Fetch event listeners for selected app
  const {
    data: eventListeners,
    isLoading: eventsLoading,
  } = useQuery<EventListener[]>({
    queryKey: ["events-list", selectedAppId],
    queryFn: () => (selectedAppId ? api.listEventListeners(selectedAppId) : Promise.resolve([])),
    enabled: !!selectedAppId && !!user,
  });

  // Select command
  useEffect(() => {
    if (mode === "command" && commands && commands.length > 0) {
      if (queryCmdId && typeof queryCmdId === "string" && commands.some((c) => c.id === queryCmdId)) {
        setSelectedCmdId(queryCmdId);
      } else if (!selectedCmdId || !commands.some((c) => c.id === selectedCmdId)) {
        setSelectedCmdId(commands[0].id);
      }
    } else if (mode === "command" && (!commands || commands.length === 0)) {
      setSelectedCmdId("");
    }
  }, [commands, queryCmdId, mode]);

  // Select event listener
  useEffect(() => {
    if (mode === "event" && eventListeners && eventListeners.length > 0) {
      if (!selectedEventId || !eventListeners.some((e) => e.id === selectedEventId)) {
        setSelectedEventId(eventListeners[0].id);
      }
    } else if (mode === "event" && (!eventListeners || eventListeners.length === 0)) {
      setSelectedEventId("");
    }
  }, [eventListeners, mode]);

  // Load flow graph when active item changes
  const activeCommand = commands?.find((c) => c.id === selectedCmdId);
  const activeEventListener = eventListeners?.find((e) => e.id === selectedEventId);

  useEffect(() => {
    if (mode === "command" && activeCommand?.flow_source) {
      const fs = activeCommand.flow_source;
      if (fs.nodes && fs.nodes.length > 0) {
        setNodes(
          fs.nodes.map((n) => ({
            ...n,
            data: { data: n.data || {} },
          }))
        );
        setEdges(fs.edges || []);
        setTimeout(() => fitView({ padding: 0.35, duration: 300 }), 80);
      }
    } else if (mode === "event" && activeEventListener?.flow_source) {
      const fs = activeEventListener.flow_source;
      if (fs.nodes && fs.nodes.length > 0) {
        setNodes(
          fs.nodes.map((n) => ({
            ...n,
            data: { data: n.data || {} },
          }))
        );
        setEdges(fs.edges || []);
        setTimeout(() => fitView({ padding: 0.35, duration: 300 }), 80);
      }
    }
  }, [activeCommand, activeEventListener, mode, setNodes, setEdges, fitView]);

  // React Flow Handlers
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            style: { stroke: "#6366f1", strokeWidth: 2 },
          },
          eds
        )
      ),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setMobileInspectorOpen(true);
      }
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setMobileInspectorOpen(false);
  }, []);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                data: {
                  ...((n.data as any)?.data || {}),
                  ...newData,
                },
              },
            };
          }
          return n;
        })
      );
      setSelectedNode((prev) => {
        if (!prev || prev.id !== nodeId) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            data: {
              ...((prev.data as any)?.data || {}),
              ...newData,
            },
          },
        };
      });
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
        setMobileInspectorOpen(false);
      }
      toast.success("Block deleted");
    },
    [selectedNode, setNodes, setEdges]
  );

  const handleAddNode = useCallback(
    (type: FlowNodeType) => {
      const id = `node_${type}_${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position: {
          x: 250 + (nodes.length % 5) * 20,
          y: 120 + nodes.length * 90,
        },
        data: {
          data: {
            name: type === "entry_command" ? "newcmd" : undefined,
            event_type: type === "entry_event" ? "message_create" : undefined,
            response_content:
              type === "action_response_create" ? "Response message" : undefined,
          },
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(newNode);
      toast.success("Block added to canvas");
    },
    [nodes.length, setNodes]
  );

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.35, duration: 300 });
  }, [fitView]);

  // Drag and drop from palette
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow") as FlowNodeType;
      if (!type) return;

      const position = {
        x: event.clientX - 280,
        y: event.clientY - 100,
      };

      const id = `node_${type}_${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position,
        data: {
          data: {
            name: type === "entry_command" ? "newcmd" : undefined,
            event_type: type === "entry_event" ? "message_create" : undefined,
            response_content:
              type === "action_response_create" ? "Response message" : undefined,
          },
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedNode(newNode);
    },
    [setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Save Flow Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAppId) throw new Error("Select an application first");

      const flowSource: FlowData = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type as FlowNodeType,
          data: (n.data as any)?.data || {},
          position: n.position,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || undefined,
          targetHandle: e.targetHandle || undefined,
        })),
      };

      if (mode === "command") {
        if (!selectedCmdId) throw new Error("No active command selected to save");
        const entry = nodes.find((n) => n.type === "entry_command");
        const entryData = (entry?.data as any)?.data as FlowNodeData | undefined;
        const name = entryData?.name || activeCommand?.name || "command";
        const description = entryData?.description || activeCommand?.description || "";

        return api.updateCommand(selectedAppId, selectedCmdId, {
          name,
          description,
          flow_source: flowSource,
        });
      } else {
        if (!selectedEventId) throw new Error("No active event listener selected to save");
        const entry = nodes.find((n) => n.type === "entry_event");
        const entryData = (entry?.data as any)?.data as FlowNodeData | undefined;
        const eventType = entryData?.event_type || activeEventListener?.type || "message_create";
        const description = entryData?.description || activeEventListener?.description || "";

        return api.updateEventListener(selectedAppId, selectedEventId, {
          type: eventType,
          description,
          flow_source: flowSource,
        });
      }
    },
    onSuccess: () => {
      toast.success("Flow saved successfully");
      if (mode === "command") {
        queryClient.invalidateQueries({ queryKey: ["commands-list", selectedAppId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["events-list", selectedAppId] });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save flow");
    },
  });

  // Deploy Mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAppId) throw new Error("No app selected");
      return api.deployCommands(selectedAppId);
    },
    onSuccess: (data) => {
      toast.success(data.message || "Commands queued for Discord deployment");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to deploy commands");
    },
  });

  // Create Item Mutation (Command or Event)
  const createItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAppId) throw new Error("Select an application first");

      if (createModalTab === "command") {
        const cleanName = newCmdName.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!cleanName) throw new Error("Valid command name is required");

        const initialSource: FlowData = {
          nodes: [
            {
              id: `node_entry_${Date.now()}`,
              type: "entry_command",
              data: {
                name: cleanName,
                description: newCmdDesc || "Slash command",
              },
              position: { x: 250, y: 100 },
            },
            {
              id: `node_reply_${Date.now() + 1}`,
              type: "action_response_create",
              data: {
                response_content: `Hello from /${cleanName}!`,
                response_ephemeral: false,
              },
              position: { x: 250, y: 280 },
            },
          ],
          edges: [
            {
              id: `edge_${Date.now()}`,
              source: `node_entry_${Date.now()}`,
              target: `node_reply_${Date.now() + 1}`,
              sourceHandle: "default",
            },
          ],
        };

        return api.createCommand(selectedAppId, {
          name: cleanName,
          description: newCmdDesc || "Custom slash command",
          flow_source: initialSource,
        });
      } else {
        const initialSource: FlowData = {
          nodes: [
            {
              id: `node_entry_${Date.now()}`,
              type: "entry_event",
              data: {
                name: newEventType,
                event_type: newEventType,
                description: newEventDesc || "Event listener",
              },
              position: { x: 250, y: 100 },
            },
            {
              id: `node_msg_${Date.now() + 1}`,
              type: "action_message_create",
              data: {
                message_content: `Event ${newEventType} received!`,
              },
              position: { x: 250, y: 280 },
            },
          ],
          edges: [
            {
              id: `edge_${Date.now()}`,
              source: `node_entry_${Date.now()}`,
              target: `node_msg_${Date.now() + 1}`,
              sourceHandle: "default",
            },
          ],
        };

        return api.createEventListener(selectedAppId, {
          type: newEventType,
          description: newEventDesc || "Custom event listener",
          flow_source: initialSource,
        });
      }
    },
    onSuccess: (newItem: any) => {
      if (createModalTab === "command") {
        toast.success(`Command /${newItem.name} created`);
        setNewCmdName("");
        setNewCmdDesc("");
        setMode("command");
        setSelectedCmdId(newItem.id);
        queryClient.invalidateQueries({ queryKey: ["commands-list", selectedAppId] });
      } else {
        toast.success(`Event listener (${newItem.type}) created`);
        setNewEventDesc("");
        setMode("event");
        setSelectedEventId(newItem.id);
        queryClient.invalidateQueries({ queryKey: ["events-list", selectedAppId] });
      }
      setCreateModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create item");
    },
  });

  // Delete Item Mutation
  const deleteItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAppId) return;
      if (mode === "command") {
        if (!selectedCmdId) return;
        return api.deleteCommand(selectedAppId, selectedCmdId);
      } else {
        if (!selectedEventId) return;
        return api.deleteEventListener(selectedAppId, selectedEventId);
      }
    },
    onSuccess: () => {
      toast.success(mode === "command" ? "Command deleted" : "Event listener deleted");
      if (mode === "command") {
        queryClient.invalidateQueries({ queryKey: ["commands-list", selectedAppId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["events-list", selectedAppId] });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete item");
    },
  });

  if (!authLoading && !user) {
    return (
      <>
        <Head>
          <title>Sign In - Veloce</title>
        </Head>
        <AuthBarrier
          redirectTo="/builder"
          title="Sign In to Access Flow Builder"
          description="Please sign in with Discord to build command flows and automations."
        />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>
          {mode === "command"
            ? activeCommand
              ? `/${activeCommand.name} - Flow Builder`
              : "Flow Builder - Veloce"
            : activeEventListener
            ? `${activeEventListener.type} - Flow Builder`
            : "Flow Builder - Veloce"}
        </title>
      </Head>

      <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
        {/* Desktop Top Navbar */}
        <header className="h-14 border-b border-slate-800 px-4 hidden md:flex items-center justify-between bg-slate-900/95 z-20">
          <div className="flex items-center gap-3">
            <Link
              href="/apps"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
              title="Back to Applications"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="h-4 w-px bg-slate-800" />

            {/* Bot App Selector */}
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {appsLoading ? (
                  <option>Loading apps...</option>
                ) : !apps || apps.length === 0 ? (
                  <option value="">No apps found</option>
                ) : (
                  apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="h-4 w-px bg-slate-800" />

            {/* Mode Switch: Commands vs Events */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setMode("command")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
                  mode === "command"
                    ? "bg-slate-800 text-emerald-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Commands
              </button>
              <button
                onClick={() => setMode("event")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
                  mode === "event"
                    ? "bg-slate-800 text-amber-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Events
              </button>
            </div>

            <div className="h-4 w-px bg-slate-800" />

            {/* Item Selector */}
            {mode === "command" ? (
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <select
                  value={selectedCmdId}
                  onChange={(e) => setSelectedCmdId(e.target.value)}
                  disabled={!commands || commands.length === 0}
                  className="bg-slate-950 border border-slate-800 text-xs font-mono font-medium rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  {commandsLoading ? (
                    <option>Loading...</option>
                  ) : !commands || commands.length === 0 ? (
                    <option value="">No commands (+ New)</option>
                  ) : (
                    commands.map((cmd) => (
                      <option key={cmd.id} value={cmd.id}>
                        /{cmd.name}
                      </option>
                    ))
                  )}
                </select>

                <button
                  onClick={() => {
                    setCreateModalTab("command");
                    setCreateModalOpen(true);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  title="Create New Command"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {activeCommand && (
                  <button
                    onClick={() => deleteItemMutation.mutate()}
                    disabled={deleteItemMutation.isPending}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition"
                    title="Delete command"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  disabled={!eventListeners || eventListeners.length === 0}
                  className="bg-slate-950 border border-slate-800 text-xs font-mono font-medium rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                >
                  {eventsLoading ? (
                    <option>Loading...</option>
                  ) : !eventListeners || eventListeners.length === 0 ? (
                    <option value="">No events (+ New)</option>
                  ) : (
                    eventListeners.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.type}
                      </option>
                    ))
                  )}
                </select>

                <button
                  onClick={() => {
                    setCreateModalTab("event");
                    setCreateModalOpen(true);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  title="Create New Event Listener"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {activeEventListener && (
                  <button
                    onClick={() => deleteItemMutation.mutate()}
                    disabled={deleteItemMutation.isPending}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition"
                    title="Delete event listener"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {selectedAppId && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] font-medium mr-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    gatewayStatus?.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                  }`}
                />
                <span className={gatewayStatus?.connected ? "text-emerald-300" : "text-slate-400"}>
                  {gatewayStatus?.connected ? "Online" : "Offline"}
                </span>
              </div>
            )}

            {apps?.find((a) => a.id === selectedAppId)?.discord_id && (
              <a
                href={getAppInviteUrl(apps.find((a) => a.id === selectedAppId)!.discord_id, "guild")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
                title="Invite bot to a Discord server"
              >
                <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                Invite
              </a>
            )}

            <button
              onClick={() => setGuildsModalOpen(true)}
              disabled={!selectedAppId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50 transition shadow-sm"
              title="View connected Discord servers"
            >
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              Servers
              {gatewayStatus?.guild_count !== undefined && gatewayStatus.guild_count > 0 && (
                <span className="bg-slate-900 text-emerald-400 px-1.5 py-0.2 rounded text-[10px] font-mono border border-slate-800">
                  {gatewayStatus.guild_count}
                </span>
              )}
            </button>

            <button
              onClick={() => setLogsModalOpen(true)}
              disabled={!selectedAppId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50 transition shadow-sm"
              title="View live execution logs"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              Logs
            </button>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending || (mode === "command" ? !selectedCmdId : !selectedEventId)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50 transition shadow-sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Flow
            </button>

            <button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending || !selectedAppId}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition disabled:opacity-50"
            >
              {deployMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              Deploy
            </button>

            <ThemeSwitch />
          </div>
        </header>

        {/* Mobile Responsive Header */}
        <header className="flex md:hidden flex-col bg-slate-900/95 border-b border-slate-800 px-3 py-2 gap-2 z-20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/apps"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs font-semibold rounded-lg px-2 py-1 text-slate-200 focus:outline-none max-w-[120px] truncate"
              >
                {apps?.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ThemeSwitch />

              <button
                onClick={() => saveMutation.mutate()}
                disabled={
                  saveMutation.isPending || (mode === "command" ? !selectedCmdId : !selectedEventId)
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                Save
              </button>

              <button
                onClick={() => deployMutation.mutate()}
                disabled={deployMutation.isPending || !selectedAppId}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium shadow-sm disabled:opacity-50"
              >
                {deployMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 fill-current" />
                )}
                Deploy
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {mobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-slate-900 border border-slate-800 p-1.5 shadow-2xl z-50 flex flex-col gap-1">
                    {apps?.find((a) => a.id === selectedAppId)?.discord_id && (
                      <a
                        href={getAppInviteUrl(apps.find((a) => a.id === selectedAppId)!.discord_id, "guild")}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 rounded-lg flex items-center gap-2"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Invite Bot</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setGuildsModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 rounded-lg flex items-center gap-2"
                    >
                      <Server className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Servers ({gatewayStatus?.guild_count || 0})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogsModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 rounded-lg flex items-center gap-2"
                    >
                      <Activity className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Execution Logs</span>
                    </button>
                    {(activeCommand || activeEventListener) && (
                      <button
                        type="button"
                        onClick={() => {
                          deleteItemMutation.mutate();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete {mode === "command" ? "Command" : "Listener"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 flex-shrink-0">
              <button
                onClick={() => setMode("command")}
                className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                  mode === "command"
                    ? "bg-slate-800 text-emerald-400 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                Commands
              </button>
              <button
                onClick={() => setMode("event")}
                className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                  mode === "event"
                    ? "bg-slate-800 text-amber-400 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                Events
              </button>
            </div>

            <div className="flex items-center gap-1 min-w-0">
              {mode === "command" ? (
                <select
                  value={selectedCmdId}
                  onChange={(e) => setSelectedCmdId(e.target.value)}
                  disabled={!commands || commands.length === 0}
                  className="bg-slate-950 border border-slate-800 text-xs font-mono rounded-lg px-2 py-1 text-slate-200 truncate flex-1"
                >
                  {commands?.map((cmd) => (
                    <option key={cmd.id} value={cmd.id}>
                      /{cmd.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  disabled={!eventListeners || eventListeners.length === 0}
                  className="bg-slate-950 border border-slate-800 text-xs font-mono rounded-lg px-2 py-1 text-slate-200 truncate flex-1"
                >
                  {eventListeners?.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.type}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={() => {
                  setCreateModalTab(mode);
                  setCreateModalOpen(true);
                }}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex-shrink-0"
                title="New Item"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Workspace Layout */}
        <div className="flex-1 flex overflow-hidden relative pb-12 md:pb-0">
          {/* Left Block Palette (Desktop) */}
          <BlockPalette onAddNode={handleAddNode} />

          {/* Center Flow Canvas */}
          <main className="flex-1 p-2 sm:p-3 bg-slate-950 relative">
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDrop={onDrop}
              onDragOver={onDragOver}
            />
          </main>

          {/* Right Inspector Panel (Desktop) */}
          <BlockInspector
            selectedNode={selectedNode}
            onUpdateNodeData={handleUpdateNodeData}
            onDeleteNode={handleDeleteNode}
          />

          {/* Mobile Bottom Bar */}
          <FlowMobileBottomBar
            selectedNode={selectedNode}
            onAddBlockClick={() => setMobileAddModalOpen(true)}
            onEditNodeClick={() => setMobileInspectorOpen(true)}
            onDeselectNode={() => setSelectedNode(null)}
            onFitView={handleFitView}
            onOpenLogs={() => setLogsModalOpen(true)}
            onOpenServers={() => setGuildsModalOpen(true)}
            hasApp={!!selectedAppId}
          />
        </div>

        {/* Mobile Drawers */}
        <FlowMobileAddBlockModal
          open={mobileAddModalOpen}
          onClose={() => setMobileAddModalOpen(false)}
          onSelectType={handleAddNode}
        />

        <FlowMobileInspectorModal
          open={mobileInspectorOpen}
          onClose={() => setMobileInspectorOpen(false)}
          selectedNode={selectedNode}
          onUpdateNodeData={handleUpdateNodeData}
          onDeleteNode={handleDeleteNode}
        />

        {/* Create Item Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl relative">
              <div className="flex items-center gap-2 mb-4 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCreateModalTab("command")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    createModalTab === "command"
                      ? "bg-slate-800 text-emerald-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  Slash Command
                </button>
                <button
                  type="button"
                  onClick={() => setCreateModalTab("event")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    createModalTab === "event"
                      ? "bg-slate-800 text-amber-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Event Listener
                </button>
              </div>

              {createModalTab === "command" ? (
                <>
                  <p className="text-xs text-slate-400 mb-5">
                    Add a new Discord slash command to this application and design its visual flow.
                  </p>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="text-slate-300 font-medium block mb-1.5">
                        Command Name <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-500 font-mono">/</span>
                        <input
                          type="text"
                          placeholder="ping, info, rank, etc."
                          value={newCmdName}
                          onChange={(e) =>
                            setNewCmdName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Lowercase letters, numbers, and dashes.</p>
                    </div>

                    <div>
                      <label className="text-slate-300 font-medium block mb-1.5">Description</label>
                      <input
                        type="text"
                        placeholder="Brief summary shown in Discord autocomplete"
                        value={newCmdDesc}
                        onChange={(e) => setNewCmdDesc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(false)}
                      className="px-3.5 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newCmdName.trim() || createItemMutation.isPending}
                      onClick={() => createItemMutation.mutate()}
                      className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow transition flex items-center gap-1.5"
                    >
                      {createItemMutation.isPending ? "Creating..." : "Create Command"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-400 mb-5">
                    Trigger visual flows automatically whenever Discord server events occur.
                  </p>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="text-slate-300 font-medium block mb-1.5">
                        Gateway Event Type <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={newEventType}
                        onChange={(e) => setNewEventType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                      >
                        <option value="message_create">message_create (New Message)</option>
                        <option value="message_update">message_update (Edited Message)</option>
                        <option value="message_delete">message_delete (Deleted Message)</option>
                        <option value="guild_member_add">guild_member_add (Member Joined)</option>
                        <option value="guild_member_remove">guild_member_remove (Member Left)</option>
                        <option value="message_reaction_add">message_reaction_add (Reaction Added)</option>
                        <option value="message_reaction_remove">message_reaction_remove (Reaction Removed)</option>
                        <option value="guild_boost">guild_boost (Server Boosted)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-300 font-medium block mb-1.5">Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Welcome new members with a channel message"
                        value={newEventDesc}
                        onChange={(e) => setNewEventDesc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(false)}
                      className="px-3.5 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={createItemMutation.isPending}
                      onClick={() => createItemMutation.mutate()}
                      className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow transition flex items-center gap-1.5"
                    >
                      {createItemMutation.isPending ? "Creating..." : "Create Listener"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <ExecutionLogsModal
          appId={selectedAppId}
          isOpen={logsModalOpen}
          onClose={() => setLogsModalOpen(false)}
        />
        <GuildsModal
          appId={selectedAppId}
          isOpen={guildsModalOpen}
          onClose={() => setGuildsModalOpen(false)}
        />
      </div>
    </>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderContent />
    </ReactFlowProvider>
  );
}
