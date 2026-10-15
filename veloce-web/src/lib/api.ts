export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface User {
  id: string;
  email: string;
  display_name: string;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string;
  created_at: string;
}

export interface App {
  id: string;
  owner_user_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  discord_id: string;
  discord_avatar?: string;
  created_at: string;
  updated_at: string;
}

export type FlowNodeType =
  | "entry_command"
  | "entry_event"
  | "entry_component_button"
  | "option_command_argument"
  | "action_response_create"
  | "action_response_edit"
  | "action_response_defer"
  | "action_message_create"
  | "control_branch"
  | "control_delay"
  | "action_variable_set";

export interface FlowNodeData {
  name?: string;
  description?: string;
  command_argument_type?: string;
  command_argument_required?: boolean;
  response_content?: string;
  response_ephemeral?: boolean;
  message_content?: string;
  message_channel_id?: string;
  condition_expression?: string;
  delay_seconds?: number;
  variable_name?: string;
  variable_value?: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  data: FlowNodeData;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Command {
  id: string;
  app_id: string;
  name: string;
  description: string;
  enabled: boolean;
  creator_user_id: string;
  flow_source: FlowData;
  created_at: string;
  updated_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.message) errorMsg = data.message;
      else if (data.error) errorMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  getCurrentUser: () => request<User>("/v1/user/@me"),
  logout: () => request<{ success: boolean }>("/v1/auth/logout", { method: "POST" }),

  // Apps
  listApps: () => request<App[]>("/v1/apps"),
  getApp: (id: string) => request<App>(`/v1/apps/${id}`),
  createApp: (data: { token: string; name?: string }) =>
    request<App>("/v1/apps", { method: "POST", body: JSON.stringify(data) }),
  deleteApp: (id: string) => request<{ success: boolean }>(`/v1/apps/${id}`, { method: "DELETE" }),

  // Commands
  listCommands: (appId: string) => request<Command[]>(`/v1/apps/${appId}/commands`),
  getCommand: (appId: string, cmdId: string) => request<Command>(`/v1/apps/${appId}/commands/${cmdId}`),
  createCommand: (
    appId: string,
    data: { name: string; description: string; flow_source: FlowData }
  ) =>
    request<Command>(`/v1/apps/${appId}/commands`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCommand: (
    appId: string,
    cmdId: string,
    data: { name?: string; description?: string; enabled?: boolean; flow_source?: FlowData }
  ) =>
    request<Command>(`/v1/apps/${appId}/commands/${cmdId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteCommand: (appId: string, cmdId: string) =>
    request<{ success: boolean }>(`/v1/apps/${appId}/commands/${cmdId}`, { method: "DELETE" }),
  deployCommands: (appId: string) =>
    request<{ queued: boolean; message: string }>(`/v1/apps/${appId}/commands/deploy`, {
      method: "POST",
    }),
};
