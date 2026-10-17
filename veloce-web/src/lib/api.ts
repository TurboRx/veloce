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
  return getApiUrl(`/v1/auth/login?redirect=${encodeURIComponent(redirect)}`);
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

export interface User {
  id: string;
  email: string;
  display_name: string;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string;
  created_at: string;
}

export interface AppDiscordStatus {
  status?: "online" | "idle" | "dnd" | "invisible";
  activity_type?: number;
  activity_name?: string;
}

export interface App {
  id: string;
  owner_user_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  discord_id: string;
  discord_public_key?: string;
  discord_avatar?: string;
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

export interface DodoBillingStatus {
  environment: "test_mode" | "live_mode";
  base_url: string;
  api_key_configured: boolean;
  api_key_masked?: string | null;
  webhook_key_configured: boolean;
  pro_product_id: string;
  studio_product_id: string;
  webhook_endpoint: string;
  recent_webhooks: Array<{
    webhook_id: string;
    event_type: string;
    app_id?: string;
    created_at: string;
  }>;
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
  createApp: (data: { token: string; name?: string; public_key?: string }) =>
    request<App>("/v1/apps", { method: "POST", body: JSON.stringify(data) }),
  updateApp: (
    id: string,
    data: {
      name?: string;
      description?: string;
      enabled?: boolean;
      public_key?: string;
      token?: string;
      plan?: "free" | "pro" | "studio";
      custom_branding?: boolean;
      discord_status?: AppDiscordStatus;
    }
  ) => request<App>(`/v1/apps/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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

  // Dodo Payments Billing & Test Mode
  getBillingStatus: () => request<DodoBillingStatus>("/v1/billing/status"),
  updateBillingConfig: (data: {
    api_key?: string;
    webhook_key?: string;
    environment?: "test_mode" | "live_mode";
    pro_product_id?: string;
    studio_product_id?: string;
  }) =>
    request<{
      success: boolean;
      environment: string;
      api_key_configured: boolean;
      pro_product_id: string;
      studio_product_id: string;
      provisioning_error?: string | null;
    }>("/v1/billing/config", { method: "POST", body: JSON.stringify(data) }),
  createCheckoutSession: (data: {
    app_id: string;
    plan: "pro" | "studio";
    customer_email?: string;
    customer_name?: string;
    discount_code?: string;
    force_sandbox?: boolean;
  }) =>
    request<{
      mode: "dodo_hosted" | "dodo_test_sandbox";
      environment: string;
      session_id: string;
      checkout_url: string;
      product_id: string;
      plan: "pro" | "studio";
      amount_cents?: number;
    }>("/v1/billing/checkout", { method: "POST", body: JSON.stringify(data) }),
  createPortalSession: (appId: string) =>
    request<{ link?: string; mode: string; customer_id?: string; subscription_id?: string }>(
      "/v1/billing/portal",
      { method: "POST", body: JSON.stringify({ app_id: appId }) }
    ),
  triggerTestWebhook: (data: {
    app_id: string;
    plan: "pro" | "studio";
    scenario?: string;
    card_number?: string;
    upi_vpa?: string;
  }) =>
    request<{
      success: boolean;
      scenario: string;
      webhook_id: string;
      event_type: string;
      signature_verified: boolean;
      webhook_result: any;
      app: App | null;
    }>("/v1/billing/test-webhook", { method: "POST", body: JSON.stringify(data) }),
};
