export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  return "";
}

export function getApiUrl(path?: string): string {
  const baseUrl = getApiBaseUrl();
  if (!path) return baseUrl || "/";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl) return cleanPath;
  return `${baseUrl}${cleanPath}`;
}

export function getLoginUrl(redirect = "/apps"): string {
  return getApiUrl(`/api/auth/discord?redirect=${encodeURIComponent(redirect)}`);
}

export const loginUrl = getLoginUrl("/apps");

export function getAppInviteUrl(
  discordId: string,
  type: "guild" | "user" = "guild"
): string {
  if (type === "user") {
    return `https://discord.com/oauth2/authorize?client_id=${discordId}&integration_type=1&scope=applications.commands`;
  }
  return `https://discord.com/oauth2/authorize?client_id=${discordId}&integration_type=0&scope=bot%20applications.commands&permissions=8`;
}

export type StaffRole = "FOUNDER" | "ADMIN" | "MODERATOR" | "SUPPORT" | "USER";

export interface User {
  id: string;
  email: string;
  display_name: string;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string | null;
  role: StaffRole;
  plan: "free" | "pro" | "studio";
  extra_bot_slots: number;
  is_banned: boolean;
  created_at: string;
}

export interface AppDiscordStatus {
  status?: "online" | "idle" | "dnd" | "invisible";
  activity_type?: number;
  activity_name?: string;
}

export interface App {
  id: string;
  user_id?: string;
  owner_user_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  discord_id: string;
  discord_public_key?: string;
  discord_avatar?: string;
  has_token?: boolean;
  token_preview?: string | null;
  plan?: "free" | "pro" | "studio";
  custom_branding?: boolean;
  discord_status?: AppDiscordStatus;
  dodo_subscription_id?: string;
  dodo_customer_id?: string;
  subscription_status?: string;
  cancel_at_next_billing_date?: boolean;
  next_billing_date?: string;
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
  event_type?: string;
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

export interface EventListenerFilter {
  channels?: string[];
  roles?: string[];
  ignore_bots?: boolean;
}

export interface EventListener {
  id: string;
  source: "discord" | "schedule" | "webhook";
  type: string;
  description: string;
  enabled: boolean;
  app_id: string;
  creator_user_id: string;
  filter?: EventListenerFilter;
  flow_source: FlowData;
  webhook_secret?: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Log {
  id: number;
  app_id: string;
  message: string;
  level: "info" | "warn" | "error";
  details?: Record<string, any>;
  created_at: string;
}

export interface GatewayStatus {
  connected: boolean;
  last_ping_at?: string;
  guild_count: number;
}

export interface Guild {
  id: string;
  name: string;
  icon?: string;
  approximate_member_count?: number;
  owner_id?: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  display_name: string;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string | null;
  role: StaffRole;
  plan: "free" | "pro" | "studio";
  extra_bot_slots: number;
  is_banned: boolean;
  bot_count: number;
  created_at: string;
  updated_at?: string;
}

export interface AdminBotRecord {
  id: string;
  user_id: string;
  owner_user_id: string;
  owner_username?: string;
  owner_display_name?: string;
  name: string;
  description?: string;
  enabled: boolean;
  discord_id: string;
  discord_avatar?: string | null;
  plan: "free" | "pro" | "studio";
  custom_branding: boolean;
  has_token: boolean;
  token_preview: string | null;
  command_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminAbuseItem {
  app_id: string;
  bot_name: string;
  bot_discord_id: string;
  enabled: boolean;
  owner_discord_id: string;
  owner_username?: string;
  owner_banned?: boolean;
  total_events_1h: number;
  rate_limit_429_count: number;
  error_count: number;
  last_activity_at: string;
}

export interface StaffAuditLogRecord {
  id: number;
  actor_discord_id: string;
  actor_username: string;
  actor_role: StaffRole;
  target_id: string;
  action_type: string;
  details?: Record<string, any>;
  ip_address: string;
  created_at: string;
}

export interface AdminOverviewResponse {
  viewer: User;
  founder_discord_id: string;
  users: AdminUserRecord[];
  bots: AdminBotRecord[];
  abuse_radar: AdminAbuseItem[];
  audit_logs: StaffAuditLogRecord[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = getApiUrl(path);
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
    let errorCode: string | undefined;
    try {
      const data = await res.json();
      if (data.message) errorMsg = data.message;
      else if (data.error) errorMsg = data.error;
      if (data.code) errorCode = data.code;
    } catch {
      // ignore
    }
    const err = new Error(errorMsg) as Error & { code?: string; status?: number };
    err.status = res.status;
    if (errorCode) err.code = errorCode;
    throw err;
  }

  return res.json();
}

export const api = {
  getCurrentUser: () => request<User>("/api/auth/me"),
  logout: () => request<{ success: boolean }>("/api/auth/logout", { method: "POST" }),

  // Bots / Apps (strictly scoped to verified session user)
  listApps: () => request<App[]>("/api/bots"),
  getApp: (id: string) => request<App>(`/api/bots/${id}`),
  createApp: (data: { token: string; name?: string; public_key?: string }) =>
    request<App>("/api/bots", { method: "POST", body: JSON.stringify(data) }),
  updateApp: (
    id: string,
    data: {
      name?: string;
      description?: string;
      enabled?: boolean;
      public_key?: string;
      token?: string;
      custom_branding?: boolean;
      discord_status?: AppDiscordStatus;
    }
  ) => request<App>(`/api/bots/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteApp: (id: string) => request<{ success: boolean }>(`/api/bots/${id}`, { method: "DELETE" }),

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

  // Event Listeners
  listEventListeners: (appId: string) =>
    request<EventListener[]>(`/v1/apps/${appId}/events`),
  getEventListener: (appId: string, eventId: string) =>
    request<EventListener>(`/v1/apps/${appId}/events/${eventId}`),
  createEventListener: (
    appId: string,
    data: {
      type: string;
      description: string;
      flow_source: FlowData;
      filter?: EventListenerFilter;
    }
  ) =>
    request<EventListener>(`/v1/apps/${appId}/events`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEventListener: (
    appId: string,
    eventId: string,
    data: {
      type?: string;
      description?: string;
      enabled?: boolean;
      filter?: EventListenerFilter;
      flow_source?: FlowData;
    }
  ) =>
    request<EventListener>(`/v1/apps/${appId}/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteEventListener: (appId: string, eventId: string) =>
    request<{ success: boolean }>(`/v1/apps/${appId}/events/${eventId}`, { method: "DELETE" }),

  // Telemetry & Logs
  listLogs: (appId: string, limit?: number, offset?: number) =>
    request<Log[]>(`/v1/apps/${appId}/logs?limit=${limit || 50}&offset=${offset || 0}`),
  getGatewayStatus: (appId: string) =>
    request<GatewayStatus>(`/v1/apps/${appId}/gateway`),
  listGuilds: (appId: string) =>
    request<Guild[]>(`/v1/apps/${appId}/guilds`),

  // Dodo Payments Checkout & Billing Portal
  createCheckoutSession: (data: {
    app_id?: string;
    plan: "pro" | "studio" | "extra_slots_10";
    customer_email?: string;
    customer_name?: string;
    discount_code?: string;
  }) =>
    request<{
      mode: "dodo_hosted" | "dodo_test_sandbox";
      environment: string;
      session_id: string;
      checkout_url: string;
      product_id: string;
      plan: "pro" | "studio" | "extra_slots_10";
      amount_cents?: number;
    }>("/v1/billing/checkout", { method: "POST", body: JSON.stringify(data) }),
  createPortalSession: (appId: string) =>
    request<{ link?: string; mode: string; customer_id?: string; subscription_id?: string }>(
      "/v1/billing/portal",
      { method: "POST", body: JSON.stringify({ app_id: appId }) }
    ),

  // Multi-Rank Super Admin & Staff Panel Endpoints (/api/admin/*)
  getAdminOverview: () => request<AdminOverviewResponse>("/api/admin/overview"),
  assignStaffRole: (data: { discord_id: string; role: StaffRole; username?: string }) =>
    request<{ success: boolean; user: AdminUserRecord }>("/api/admin/staff/role", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAdminBotLogs: (botId: string) => request<Log[]>(`/api/admin/bots/${botId}/logs`),
  suspendAdminBot: (botId: string, enabled: boolean) =>
    request<{ success: boolean; bot: App }>(`/api/admin/bots/${botId}/suspend`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  revealBotToken: (botId: string) =>
    request<{ bot_id: string; bot_name: string; discord_id: string; bot_token: string | null }>(
      `/api/admin/bots/${botId}/reveal-token`,
      { method: "POST" }
    ),
  purgeAdminBot: (botId: string) =>
    request<{ success: boolean; deleted_bot_id: string }>(`/api/admin/bots/${botId}`, {
      method: "DELETE",
    }),
  overrideAdminUser: (
    discordId: string,
    data: {
      plan?: "free" | "pro" | "studio";
      extra_bot_slots?: number;
      is_banned?: boolean;
    }
  ) =>
    request<{ success: boolean; user: AdminUserRecord }>(`/api/admin/users/${discordId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  emergencyBanAndPurge: (discordId: string, reason?: string) =>
    request<{ success: boolean; discord_id: string; purged_bots_count: number }>(
      "/api/admin/abuse/ban-and-purge",
      {
        method: "POST",
        body: JSON.stringify({ discord_id: discordId, reason }),
      }
    ),
};
