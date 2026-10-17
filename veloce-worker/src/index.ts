import { Hono } from "hono";
import { cors } from "hono/cors";
import { neon } from "@neondatabase/serverless";
import { verifyDiscordSignature } from "./crypto";
import { applyBranding, executeFlow, InteractionPayload } from "./flow";
import {
  createDodoClient,
  ensureDodoProducts,
  loadDodoRuntimeConfig,
  PLAN_CATALOG,
  resolveDodoEnvironment,
  signStandardWebhookPayload,
  VelocePlanSlug,
} from "./dodo";
import {
  AuthenticatedUser,
  createSignedOAuthState,
  DEFAULT_FOUNDER_DISCORD_ID,
  hasRequiredRole,
  maskBotToken,
  normalizeStaffRole,
  resolveDiscordOAuthCredentials,
  resolveSessionSecret,
  signSessionToken,
  StaffRole,
  verifySessionToken,
  verifySignedOAuthState,
} from "./auth";

export interface Env {
  DATABASE_URL: string;
  SESSION_SECRET?: string;
  FOUNDER_DISCORD_ID?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ALLOWED_ORIGINS?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DODO_PAYMENTS_API_KEY?: string;
  DODO_PAYMENTS_WEBHOOK_KEY?: string;
  DODO_PAYMENTS_ENVIRONMENT?: string;
  DODO_PRODUCT_PRO_ID?: string;
  DODO_PRODUCT_STUDIO_ID?: string;
  DODO_PRODUCT_EXTRA_SLOTS_ID?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Track active gateway sessions & WebSocket instances within the current Worker isolate
const activeGatewaySessions = new Map<string, number>();
const activeGatewaySockets = new Map<string, WebSocket>();
let schemaMigrated = false;

// Tier Bot Creation Limits
const STARTER_LIMIT = 2;
const PRO_LIMIT = 10;
const STUDIO_BOT_SOFT_LIMIT = 30;

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (
        origin.includes("veloce-app.pages.dev") ||
        origin.includes("localhost") ||
        origin.includes("workers.dev")
      ) {
        return origin;
      }
      return "*";
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Signature-Ed25519",
      "X-Signature-Timestamp",
      "webhook-id",
      "webhook-signature",
      "webhook-timestamp",
    ],
    credentials: true,
  })
);

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawVal] = part.trim().split("=");
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(rawVal.join("=") || "");
    }
  }
  return cookies;
}

function getPublicOrigin(c: any): string {
  const fwdHost = c.req.header("x-forwarded-host");
  const fwdProto = c.req.header("x-forwarded-proto") || "https";
  if (fwdHost) {
    return `${fwdProto}://${fwdHost}`;
  }
  const url = new URL(c.req.url);
  return url.origin;
}

function getClientIp(c: any): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

async function ensureSchema(sql: any) {
  if (schemaMigrated) return;
  try {
    // Users RBAC & quota columns
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER'`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_bot_slots INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`;

    // Bots (apps) user isolation & billing columns
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS user_id TEXT`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS custom_branding BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS discord_status JSONB`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none'`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS cancel_at_next_billing_date BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ`;

    // Commands, events, logs user_id columns
    await sql`ALTER TABLE commands ADD COLUMN IF NOT EXISTS user_id TEXT`;
    await sql`ALTER TABLE event_listeners ADD COLUMN IF NOT EXISTS user_id TEXT`.catch(() => {});
    await sql`ALTER TABLE logs ADD COLUMN IF NOT EXISTS user_id TEXT`.catch(() => {});

    // Backfill apps.user_id from owner_user_id for real Discord users, and purge shared mock usr_admin rows
    await sql`
      UPDATE apps
      SET user_id = REPLACE(owner_user_id, 'usr_', '')
      WHERE user_id IS NULL AND owner_user_id LIKE 'usr_%' AND owner_user_id != 'usr_admin'
    `.catch(() => {});

    // Assign any legacy usr_admin bots exclusively to the Founder Discord ID so they are never globally shared
    await sql`
      INSERT INTO users (id, email, display_name, discord_id, discord_username, role, created_at, updated_at)
      VALUES (
        ${`usr_${DEFAULT_FOUNDER_DISCORD_ID}`},
        'founder@veloce.app',
        'Founder',
        ${DEFAULT_FOUNDER_DISCORD_ID},
        'founder',
        'FOUNDER',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET role = 'FOUNDER'
    `.catch(() => {});

    await sql`
      UPDATE apps
      SET
        user_id = ${DEFAULT_FOUNDER_DISCORD_ID},
        owner_user_id = ${`usr_${DEFAULT_FOUNDER_DISCORD_ID}`},
        creator_user_id = ${`usr_${DEFAULT_FOUNDER_DISCORD_ID}`}
      WHERE owner_user_id = 'usr_admin' OR user_id IS NULL
    `.catch(() => {});

    // Dodo Webhooks & Config tables
    await sql`
      CREATE TABLE IF NOT EXISTS dodo_webhook_events (
        webhook_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        app_id TEXT,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS dodo_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Immutable Staff Audit Logs table
    await sql`
      CREATE TABLE IF NOT EXISTS staff_audit_logs (
        id SERIAL PRIMARY KEY,
        actor_discord_id TEXT NOT NULL,
        actor_username TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        details JSONB,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Blacklisted Discord Bot Application IDs table
    await sql`
      CREATE TABLE IF NOT EXISTS blacklisted_applications (
        application_id TEXT PRIMARY KEY,
        reason TEXT,
        blacklisted_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    schemaMigrated = true;
  } catch (err) {
    console.error("ensureSchema error", err);
  }
}

function sanitizeBotForClient(bot: any) {
  if (!bot) return null;
  const { discord_token, bot_token, ...safe } = bot;
  const rawToken = discord_token || bot_token || null;
  return {
    ...safe,
    user_id: safe.user_id || String(safe.owner_user_id || "").replace(/^usr_/, ""),
    has_token: Boolean(rawToken),
    token_preview: maskBotToken(rawToken),
  };
}

async function writeStaffAuditLog(
  sql: any,
  actor: AuthenticatedUser,
  targetId: string,
  actionType: string,
  details: Record<string, any>,
  ipAddress: string
) {
  await sql`
    INSERT INTO staff_audit_logs (
      actor_discord_id, actor_username, actor_role, target_id, action_type, details, ip_address, created_at
    ) VALUES (
      ${actor.discord_id},
      ${actor.discord_username || actor.display_name || actor.discord_id},
      ${actor.role},
      ${targetId},
      ${actionType},
      ${JSON.stringify(details || {})}::jsonb,
      ${ipAddress},
      NOW()
    )
  `.catch((err: any) => {
    console.error("Failed to write staff audit log", err);
  });
}

/**
 * Cryptographically verifies the session token from the `veloce_session` HttpOnly cookie
 * or `Authorization: Bearer <jwt>` header.
 * NEVER trusts client-sent headers, query params, or unsigned values for `user_id`, `discord_id`, or `role`.
 */
async function getVerifiedUser(c: any, sql: any): Promise<AuthenticatedUser | null> {
  const cookies = parseCookies(c.req.header("cookie"));
  let rawToken = cookies["veloce_session"] || "";

  const authHeader = c.req.header("authorization") || "";
  if (!rawToken && authHeader.toLowerCase().startsWith("bearer ")) {
    rawToken = authHeader.slice(7).trim();
  }

  if (!rawToken) return null;

  const sessionSecret = await resolveSessionSecret(sql, c.env);
  const verifiedPayload = await verifySessionToken(rawToken, sessionSecret);
  if (!verifiedPayload || !verifiedPayload.discord_id) {
    return null;
  }

  const discordId = String(verifiedPayload.discord_id);
  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();
  const isFounder = discordId === founderId;

  const rows = await sql`
    SELECT id, email, display_name, discord_id, discord_username, discord_avatar, role, plan, COALESCE(extra_bot_slots, 0) AS extra_bot_slots, COALESCE(is_banned, false) AS is_banned, created_at
    FROM users
    WHERE discord_id = ${discordId} OR id = ${`usr_${discordId}`}
    LIMIT 1
  `.catch(() => []);

  if (!rows || rows.length === 0) {
    return null;
  }

  const dbUser = rows[0];
  const effectiveRole: StaffRole = isFounder
    ? "FOUNDER"
    : normalizeStaffRole(dbUser.role);

  if (isFounder && dbUser.role !== "FOUNDER") {
    await sql`
      UPDATE users SET role = 'FOUNDER', is_banned = false, updated_at = NOW()
      WHERE id = ${dbUser.id}
    `.catch(() => {});
  }

  return {
    id: dbUser.id,
    discord_id: String(dbUser.discord_id),
    discord_username: dbUser.discord_username || "discord_user",
    discord_avatar: dbUser.discord_avatar || null,
    display_name: dbUser.display_name || dbUser.discord_username || "Discord User",
    email: dbUser.email || `${discordId}@discord.user`,
    role: effectiveRole,
    plan: (dbUser.plan as "free" | "pro" | "studio") || "free",
    extra_bot_slots: Math.max(0, Number(dbUser.extra_bot_slots || 0)),
    is_banned: isFounder ? false : Boolean(dbUser.is_banned),
    created_at: dbUser.created_at,
  };
}

function disconnectBotGatewayImmediate(appId: string) {
  activeGatewaySessions.delete(appId);
  const ws = activeGatewaySockets.get(appId);
  if (ws) {
    try {
      ws.send(
        JSON.stringify({
          op: 3,
          d: {
            since: null,
            activities: [],
            status: "invisible",
            afk: false,
          },
        })
      );
      ws.close(1000, "Bot disconnected");
    } catch {}
    activeGatewaySockets.delete(appId);
  }
}

async function forceDiscordBotOfflineAndClearCommands(discordId?: string, discordToken?: string) {
  if (!discordToken) return;

  // 1. Clear all global slash commands on Discord
  if (discordId && discordId !== "000000000000000000") {
    try {
      await fetch(`https://discord.com/api/v10/applications/${discordId}/commands`, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${discordToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([]),
      });
    } catch (err) {
      console.error("Failed to clear Discord commands on delete", err);
    }
  }

  // 2. Connect briefly to Gateway with status="invisible" and close with 1000 so Discord marks bot Offline immediately
  await new Promise<void>((resolve) => {
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => {
      try {
        ws?.close(1000, "Offline");
      } catch {}
      resolve();
    }, 3500);

    try {
      ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
      ws.addEventListener("message", (event: MessageEvent) => {
        try {
          const packet = JSON.parse(typeof event.data === "string" ? event.data : "{}");
          if (packet.op === 10) {
            ws?.send(
              JSON.stringify({
                op: 2,
                d: {
                  token: discordToken,
                  intents: 1,
                  properties: { os: "linux", browser: "veloce", device: "veloce" },
                  presence: {
                    status: "invisible",
                    activities: [],
                    afk: true,
                  },
                },
              })
            );
          } else if (packet.op === 0 && packet.t === "READY") {
            ws?.send(
              JSON.stringify({
                op: 3,
                d: { since: null, activities: [], status: "invisible", afk: true },
              })
            );
            clearTimeout(timer);
            ws?.close(1000, "Bot removed");
            resolve();
          }
        } catch {}
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("close", () => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function syncSlashCommandsWithDiscord(sql: any, botApp: any) {
  if (!botApp?.discord_id || botApp.discord_id === "000000000000000000" || !botApp?.discord_token) {
    return { synced: false, count: 0 };
  }

  let commands = await sql`
    SELECT id, name, description, flow_source
    FROM commands
    WHERE app_id = ${botApp.id} AND enabled = true
  `;

  if (!commands || commands.length === 0) {
    const cmdId = "cmd_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const defaultFlow = {
      nodes: [
        {
          id: "node_entry_1",
          type: "entry_command",
          data: { name: "ping", description: "Replies with pong and bot status" },
          position: { x: 250, y: 100 },
        },
        {
          id: "node_reply_1",
          type: "action_response_create",
          data: {
            response_content: "Pong! 🏓 Hello {user.username}, I am online and running!",
            response_ephemeral: false,
          },
          position: { x: 250, y: 280 },
        },
      ],
      edges: [
        {
          id: "edge_1",
          source: "node_entry_1",
          target: "node_reply_1",
          sourceHandle: "default",
        },
      ],
    };

    const ownerUserId = botApp.owner_user_id || `usr_${DEFAULT_FOUNDER_DISCORD_ID}`;
    const userId = botApp.user_id || String(ownerUserId).replace(/^usr_/, "");

    commands = await sql`
      INSERT INTO commands (
        id, app_id, creator_user_id, user_id, name, description, flow_source, enabled, created_at, updated_at
      ) VALUES (
        ${cmdId},
        ${botApp.id},
        ${ownerUserId},
        ${userId},
        'ping',
        'Replies with pong and bot status',
        ${JSON.stringify(defaultFlow)},
        true,
        NOW(),
        NOW()
      )
      RETURNING id, name, description, flow_source
    `;
  }

  try {
    const payload = commands.map((cmd: any) => ({
      name: cmd.name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "ping",
      description: (cmd.description || `Run /${cmd.name}`).substring(0, 100),
      type: 1,
    }));

    const res = await fetch(
      `https://discord.com/api/v10/applications/${botApp.discord_id}/commands`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botApp.discord_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (res.status === 429) {
      await sql`
        INSERT INTO logs (app_id, user_id, message, level, details, created_at)
        VALUES (
          ${botApp.id},
          ${botApp.user_id || null},
          'Discord API 429 Rate Limit encountered during slash command sync',
          'error',
          ${JSON.stringify({ status: 429, endpoint: "commands.sync" })}::jsonb,
          NOW()
        )
      `.catch(() => {});
    }

    return { synced: res.ok, count: commands.length };
  } catch (err) {
    console.error("Failed to sync commands with Discord", err);
    return { synced: false, count: commands.length };
  }
}

async function processBotInteraction(botApp: any, payload: InteractionPayload, sql: any) {
  const isPaidAndUnbranded =
    (botApp.plan === "pro" || botApp.plan === "studio") && !!botApp.custom_branding;
  const addBranding = !isPaidAndUnbranded;

  if (payload.type === 2) {
    const cmdName = payload.data?.name;
    if (!cmdName) {
      return {
        type: 4,
        data: { content: applyBranding("Unknown command invocation", addBranding), flags: 64 },
      };
    }

    const cmds = await sql`
      SELECT id, name, flow_source 
      FROM commands 
      WHERE app_id = ${botApp.id} AND LOWER(name) = LOWER(${cmdName}) AND enabled = true
      LIMIT 1
    `;

    if (cmds && cmds.length > 0 && cmds[0].flow_source) {
      let flowSource = cmds[0].flow_source;
      if (typeof flowSource === "string") {
        try {
          flowSource = JSON.parse(flowSource);
        } catch {
          flowSource = { nodes: [], edges: [] };
        }
      }

      const execution = executeFlow(flowSource, payload, { addBranding });

      if (execution.channelMessages && execution.channelMessages.length > 0 && botApp.discord_token) {
        for (const msg of execution.channelMessages) {
          fetch(`https://discord.com/api/v10/channels/${msg.channel_id}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${botApp.discord_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: msg.content }),
          }).catch(() => {});
        }
      }

      sql`
        INSERT INTO logs (app_id, message, level, details, created_at)
        VALUES (
          ${botApp.id},
          ${`Slash command /${cmdName} executed`},
          'info',
          ${JSON.stringify({ logs: execution.logs, user: payload.member?.user || payload.user })},
          NOW()
        )
      `.catch(() => {});

      return execution.response;
    }

    return {
      type: 4,
      data: {
        content: "This command is no longer active.",
        flags: 64,
      },
    };
  }

  return {
    type: 4,
    data: { content: applyBranding("Interaction acknowledged", addBranding), flags: 64 },
  };
}

// Maintain a Discord Gateway WebSocket session so enabled bots appear Online in Discord
async function maintainBotGateway(botApp: any, sql: any, durationMs = 25000): Promise<void> {
  if (!botApp?.discord_token || !botApp?.enabled) return;

  const now = Date.now();
  const existingUntil = activeGatewaySessions.get(botApp.id) || 0;
  if (existingUntil > now + 3000) {
    return;
  }
  activeGatewaySessions.set(botApp.id, now + durationMs);

  const isPaidAndUnbranded =
    (botApp.plan === "pro" || botApp.plan === "studio") && !!botApp.custom_branding;

  const statusObj = botApp.discord_status || {};
  const presenceStatus = isPaidAndUnbranded && statusObj.status ? statusObj.status : "online";
  const activityName =
    isPaidAndUnbranded && statusObj.activity_name
      ? statusObj.activity_name
      : "⚡ Powered by Veloce";
  const activityType =
    isPaidAndUnbranded && typeof statusObj.activity_type === "number"
      ? statusObj.activity_type
      : 0;

  return new Promise<void>((resolve) => {
    let ws: WebSocket | null = null;
    let heartbeatTimer: any = null;
    let closeTimer: any = null;
    let seq: number | null = null;

    const cleanup = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (closeTimer) clearTimeout(closeTimer);
      activeGatewaySessions.delete(botApp.id);
      activeGatewaySockets.delete(botApp.id);
      resolve();
    };

    try {
      ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
      activeGatewaySockets.set(botApp.id, ws);
    } catch {
      cleanup();
      return;
    }

    closeTimer = setTimeout(() => {
      try {
        ws?.close(1000, "Cycle complete");
      } catch {}
      cleanup();
    }, durationMs);

    ws.addEventListener("message", async (event: MessageEvent) => {
      try {
        const packet = JSON.parse(typeof event.data === "string" ? event.data : "{}");
        if (packet.s !== null && packet.s !== undefined) {
          seq = packet.s;
        }

        if (packet.op === 10) {
          const interval = packet.d?.heartbeat_interval || 41250;
          heartbeatTimer = setInterval(async () => {
            try {
              // Verify bot still exists and is enabled before heartbeating
              const activeCheck = await sql`
                SELECT enabled FROM apps WHERE id = ${botApp.id} LIMIT 1
              `;
              if (!activeCheck || activeCheck.length === 0 || !activeCheck[0].enabled) {
                disconnectBotGatewayImmediate(botApp.id);
                cleanup();
                return;
              }
              ws?.send(JSON.stringify({ op: 1, d: seq }));
            } catch {}
          }, interval);

          ws?.send(
            JSON.stringify({
              op: 2,
              d: {
                token: botApp.discord_token,
                intents: 33281,
                properties: {
                  os: "linux",
                  browser: "veloce",
                  device: "veloce",
                },
                presence: {
                  status: presenceStatus,
                  activities: [
                    {
                      name: activityName,
                      type: activityType,
                    },
                  ],
                  afk: false,
                },
              },
            })
          );
        }

        if (packet.op === 0) {
          if (packet.t === "INTERACTION_CREATE" && packet.d) {
            // Verify the bot still exists and is enabled in DB before answering any command
            const currentAppRows = await sql`
              SELECT id, name, discord_id, discord_token, enabled, plan, custom_branding
              FROM apps
              WHERE id = ${botApp.id}
              LIMIT 1
            `;
            if (!currentAppRows || currentAppRows.length === 0 || !currentAppRows[0].enabled) {
              disconnectBotGatewayImmediate(botApp.id);
              cleanup();
              return;
            }

            const interaction = packet.d as InteractionPayload;
            const responseBody = await processBotInteraction(currentAppRows[0], interaction, sql);
            if (interaction.id && interaction.token && responseBody) {
              await fetch(
                `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(responseBody),
                }
              );
            }
          }
        }
      } catch (err) {
        console.error("Gateway packet error", err);
      }
    });

    ws.addEventListener("close", () => cleanup());
    ws.addEventListener("error", () => cleanup());
  });
}

async function syncAllBotsGateway(sql: any, durationMs = 25000) {
  try {
    await ensureSchema(sql);
    const apps = await sql`
      SELECT id, name, discord_id, discord_token, enabled, plan, custom_branding, discord_status
      FROM apps
      WHERE enabled = true AND discord_token IS NOT NULL
    `;
    if (!apps || apps.length === 0) return;

    await Promise.all(
      apps.map(async (botApp: any) => {
        await syncSlashCommandsWithDiscord(sql, botApp);
        await maintainBotGateway(botApp, sql, durationMs);
      })
    );
  } catch (err) {
    console.error("syncAllBotsGateway error", err);
  }
}

// Helper: Verify that the authenticated user owns the target bot (prevents IDOR)
async function getOwnedBotOrNull(sql: any, appId: string, user: AuthenticatedUser) {
  const rows = await sql`
    SELECT id, user_id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, discord_token, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
    FROM apps
    WHERE id = ${appId}
      AND (user_id = ${user.discord_id} OR owner_user_id = ${user.id})
    LIMIT 1
  `;
  return rows && rows.length > 0 ? rows[0] : null;
}

// Root and Health
app.get("/", (c) =>
  c.json({
    service: "veloce-api",
    runtime: "cloudflare-workers",
    status: "ok",
    version: "0.3.0",
    timestamp: new Date().toISOString(),
  })
);

app.get("/v1/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.get("/v1/stats", async (c) => {
  try {
    const sql = neon(c.env.DATABASE_URL);
    const [appsCount, cmdsCount, logsCount] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM apps`,
      sql`SELECT COUNT(*)::int AS count FROM commands`,
      sql`SELECT COUNT(*)::int AS count FROM logs`,
    ]);
    return c.json({
      bots_built: Math.max(appsCount[0]?.count || 0, 12),
      active_commands: Math.max(cmdsCount[0]?.count || 0, 48),
      flows_executed: Math.max(logsCount[0]?.count || 0, 1240),
      uptime_percent: "99.99%",
    });
  } catch {
    return c.json({
      bots_built: 12,
      active_commands: 48,
      flows_executed: 1240,
      uptime_percent: "99.99%",
    });
  }
});

// ============================================================================
// Task 1: Cryptographically Signed Discord OAuth2 & Zero-Trust Session Auth
// ============================================================================

async function handleGetCurrentUser(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (authUser.is_banned) {
    return c.json({ error: "Your account has been suspended for Terms of Service violations." }, 403);
  }
  return c.json(authUser);
}

app.get("/api/auth/me", handleGetCurrentUser);
app.get("/v1/user/@me", handleGetCurrentUser);

async function handleDiscordOAuthStart(c: any) {
  const rawRedirect = c.req.query("redirect") || "/apps";
  const safeRedirect = rawRedirect.startsWith("/") ? rawRedirect : "/apps";
  const origin = getPublicOrigin(c);
  const callbackUrl = `${origin}/api/auth/discord/callback`;

  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const { clientId, clientSecret } = await resolveDiscordOAuthCredentials(sql, c.env);
  if (!clientId || !clientSecret) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Discord OAuth2 Configuration Required — Veloce</title>
  <style>
    body { background: #0b0d13; color: #f3f4f6; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .card { max-width: 540px; width: 100%; background: #12151f; border: 1px solid #262b3d; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #fff; }
    p { font-size: 0.875rem; line-height: 1.6; color: #9ca3af; margin: 0 0 1rem; }
    code { background: #1c2030; color: #818cf8; padding: 0.2rem 0.45rem; border-radius: 6px; font-size: 0.8rem; word-break: break-all; }
    .box { background: #0b0d13; border: 1px solid #262b3d; border-radius: 10px; padding: 0.875rem; margin-bottom: 1rem; font-size: 0.8rem; color: #d1d5db; }
    a.btn { display: inline-block; background: #5865F2; color: #fff; text-decoration: none; padding: 0.65rem 1.25rem; border-radius: 10px; font-weight: 600; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Discord OAuth2 Credentials Required</h1>
    <p>To enable zero-trust Discord login, configure your Discord OAuth2 application secrets in Cloudflare:</p>
    <div class="box">
      1. Set <code>DISCORD_CLIENT_ID</code>, <code>DISCORD_CLIENT_SECRET</code>, and <code>SESSION_SECRET</code> in your Cloudflare environment variables.<br/><br/>
      2. In the Discord Developer Portal &rarr; OAuth2 &rarr; Redirects, add:<br/>
      <code>${callbackUrl}</code>
    </div>
    <a class="btn" href="/">Back to Home</a>
  </div>
</body>
</html>`;
    return new Response(html, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const sessionSecret = await resolveSessionSecret(sql, c.env);
  const { state } = await createSignedOAuthState(safeRedirect, sessionSecret);

  const discordAuthUrl = new URL("https://discord.com/oauth2/authorize");
  discordAuthUrl.searchParams.set("client_id", clientId);
  discordAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  discordAuthUrl.searchParams.set("response_type", "code");
  discordAuthUrl.searchParams.set("scope", "identify email");
  discordAuthUrl.searchParams.set("state", state);
  discordAuthUrl.searchParams.set("prompt", "consent");

  const isSecure = origin.startsWith("https://");
  const cookieAttrs = `Path=/; HttpOnly; ${isSecure ? "Secure; " : ""}SameSite=Lax; Max-Age=600`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: discordAuthUrl.toString(),
      "Set-Cookie": `veloce_oauth_state=${encodeURIComponent(state)}; ${cookieAttrs}`,
    },
  });
}

app.get("/api/auth/discord", handleDiscordOAuthStart);
app.get("/v1/auth/login", handleDiscordOAuthStart);

async function handleDiscordOAuthCallback(c: any) {
  const code = c.req.query("code") || "";
  const stateParam = c.req.query("state") || "";
  const origin = getPublicOrigin(c);
  const callbackUrl = `${origin}/api/auth/discord/callback`;

  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const sessionSecret = await resolveSessionSecret(sql, c.env);
  const cookies = parseCookies(c.req.header("cookie"));
  const cookieState = cookies["veloce_oauth_state"];

  const verifiedState = await verifySignedOAuthState(stateParam, cookieState, sessionSecret);
  if (!verifiedState || !code) {
    return c.json(
      { error: "Invalid or expired OAuth2 CSRF state nonce. Please try logging in again." },
      400
    );
  }

  const { clientId, clientSecret } = await resolveDiscordOAuthCredentials(sql, c.env);
  if (!clientId || !clientSecret) {
    return c.json({ error: "Discord OAuth2 credentials are not configured" }, 503);
  }

  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
    }),
  });

  if (!tokenRes.ok) {
    return c.json({ error: "Failed to exchange Discord OAuth2 authorization code" }, 401);
  }

  const tokenData: any = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return c.json({ error: "Failed to fetch verified Discord profile" }, 401);
  }

  const discordUser: any = await userRes.json();
  const discordId = String(discordUser.id || "").trim();
  if (!/^\d{17,20}$/.test(discordId)) {
    return c.json({ error: "Invalid Discord user ID returned from OAuth provider" }, 400);
  }

  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();
  const isFounder = discordId === founderId;
  const userId = `usr_${discordId}`;
  const displayName = discordUser.global_name || discordUser.username || "Discord User";
  const email = discordUser.email || `${discordId}@discord.user`;

  // Check if user already exists (e.g., pre-authorized staff or existing account)
  const existingRows = await sql`
    SELECT id, role, COALESCE(is_banned, false) AS is_banned
    FROM users
    WHERE discord_id = ${discordId} OR id = ${userId}
    LIMIT 1
  `.catch(() => []);

  if (existingRows?.[0]?.is_banned && !isFounder) {
    return c.json(
      { error: "Your account has been suspended for Terms of Service violations." },
      403
    );
  }

  const initialRole: StaffRole = isFounder
    ? "FOUNDER"
    : normalizeStaffRole(existingRows?.[0]?.role || "USER");

  await sql`
    INSERT INTO users (
      id, email, display_name, discord_id, discord_username, discord_avatar, role, created_at, updated_at
    ) VALUES (
      ${userId},
      ${email},
      ${displayName},
      ${discordId},
      ${discordUser.username || displayName},
      ${discordUser.avatar || null},
      ${initialRole},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      discord_id = EXCLUDED.discord_id,
      discord_username = EXCLUDED.discord_username,
      discord_avatar = EXCLUDED.discord_avatar,
      role = CASE
        WHEN EXCLUDED.discord_id = ${founderId} THEN 'FOUNDER'
        ELSE users.role
      END,
      updated_at = NOW()
  `;

  // Issue cryptographically signed HMAC-SHA256 Session JWT
  const signedJwt = await signSessionToken(discordId, sessionSecret);
  const isSecure = origin.startsWith("https://");
  const sessionCookie = `veloce_session=${encodeURIComponent(signedJwt)}; Path=/; HttpOnly; ${
    isSecure ? "Secure; " : ""
  }SameSite=Lax; Max-Age=604800`;
  const clearStateCookie = `veloce_oauth_state=; Path=/; HttpOnly; ${
    isSecure ? "Secure; " : ""
  }SameSite=Lax; Max-Age=0`;

  const cleanPath = verifiedState.redirect.startsWith("/")
    ? verifiedState.redirect
    : `/${verifiedState.redirect}`;
  const finalRedirectUrl = verifiedState.redirect.startsWith("http")
    ? verifiedState.redirect
    : `${origin}${cleanPath}`;

  const headers = new Headers();
  headers.set("Location", finalRedirectUrl);
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", clearStateCookie);

  return new Response(null, {
    status: 302,
    headers,
  });
}

app.get("/api/auth/discord/callback", handleDiscordOAuthCallback);
app.get("/v1/auth/login/callback", handleDiscordOAuthCallback);

function handleLogout(c: any) {
  const origin = getPublicOrigin(c);
  const isSecure = origin.startsWith("https://");
  return new Response(JSON.stringify({ status: "logged_out", success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `veloce_session=; Path=/; HttpOnly; ${
        isSecure ? "Secure; " : ""
      }SameSite=Lax; Max-Age=0`,
    },
  });
}

app.post("/api/auth/logout", handleLogout);
app.post("/v1/auth/logout", handleLogout);

// Discord Interactions Webhook Endpoint (verified via Ed25519 signature)
async function handleDiscordInteraction(c: any) {
  const appId = c.req.param("app_id");
  const signature = c.req.header("x-signature-ed25519") || "";
  const timestamp = c.req.header("x-signature-timestamp") || "";
  const rawBody = await c.req.text();

  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const apps = await sql`
    SELECT id, user_id, owner_user_id, name, discord_id, discord_public_key, discord_token, enabled, plan, custom_branding
    FROM apps 
    WHERE (id = ${appId} OR discord_id = ${appId}) AND enabled = true
    LIMIT 1
  `;

  if (!apps || apps.length === 0) {
    return c.text("Application not found or disabled", 404);
  }

  const botApp = apps[0];

  if (botApp.discord_public_key) {
    if (!signature || !timestamp) {
      return c.text("Missing Discord signature headers", 401);
    }
    const isValid = await verifyDiscordSignature(
      botApp.discord_public_key,
      signature,
      timestamp,
      rawBody
    );
    if (!isValid) {
      return c.text("Invalid request signature", 401);
    }
  }

  let payload: InteractionPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.text("Invalid JSON payload", 400);
  }

  if (payload.type === 1) {
    return c.json({ type: 1 });
  }

  const response = await processBotInteraction(botApp, payload, sql);
  return c.json(response);
}

app.post("/v1/interactions/:app_id", handleDiscordInteraction);
app.post("/interactions/:app_id", handleDiscordInteraction);

// ============================================================================
// Task 2 & Task 3: Strict Per-User Bot Isolation, Token Masking & 402 Upsell
// ============================================================================

async function handleListUserBots(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);
  if (authUser.is_banned) return c.json({ error: "Account suspended" }, 403);

  const rows = await sql`
    SELECT id, user_id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, discord_token, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
    FROM apps
    WHERE user_id = ${authUser.discord_id} OR owner_user_id = ${authUser.id}
    ORDER BY created_at DESC
  `;

  c.executionCtx.waitUntil(
    Promise.all(
      rows
        .filter((botApp: any) => botApp.enabled)
        .map(async (botApp: any) => {
          await syncSlashCommandsWithDiscord(sql, botApp);
          await maintainBotGateway(botApp, sql, 25000);
        })
    )
  );

  // Never expose raw bot_token/discord_token in list responses
  const sanitized = rows.map((bot: any) => sanitizeBotForClient(bot));
  return c.json(sanitized);
}

app.get("/api/bots", handleListUserBots);
app.get("/v1/apps", handleListUserBots);

async function handleGetUserBot(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);
  if (authUser.is_banned) return c.json({ error: "Account suspended" }, 403);

  const id = c.req.param("id");
  const bot = await getOwnedBotOrNull(sql, id, authUser);
  if (!bot) return c.json({ error: "Bot not found" }, 404);

  return c.json(sanitizeBotForClient(bot));
}

app.get("/api/bots/:id", handleGetUserBot);
app.get("/v1/apps/:id", handleGetUserBot);

async function handleCreateUserBot(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);
  if (authUser.is_banned) return c.json({ error: "Account suspended" }, 403);

  const body = await c.req.json();
  const token = body.token?.trim();
  const customName = body.name?.trim();
  const publicKey = body.public_key?.trim();

  if (!token) {
    return c.json({ error: "Bot token is required" }, 400);
  }

  const existingApps = await sql`
    SELECT id, plan, enabled
    FROM apps
    WHERE user_id = ${authUser.discord_id} OR owner_user_id = ${authUser.id}
  `;

  const extraBotSlots = Math.max(0, Number(authUser.extra_bot_slots || 0));
  const hasStudioTier =
    authUser.plan === "studio" ||
    existingApps.some((a: any) => a.plan === "studio");
  const hasProTier =
    !hasStudioTier &&
    (authUser.plan === "pro" || existingApps.some((a: any) => a.plan === "pro"));

  const currentBotCount = existingApps.length;

  // Task 3: Self-Serve Extension Pack Upsell (402 Payment Required when hitting 30 + extra_bot_slots)
  if (hasStudioTier) {
    const studioMaxBots = STUDIO_BOT_SOFT_LIMIT + extraBotSlots;
    if (currentBotCount >= studioMaxBots) {
      const msg =
        "You have reached your Studio allocation of 30 active bots. Add the +10 Extra Bot Slots Expansion Pack ($4.99/month) to connect more bots instantly.";
      return c.json(
        {
          code: "FAIR_USE_LIMIT_REACHED",
          message: msg,
          error: msg,
          limit: studioMaxBots,
          extra_bot_slots: extraBotSlots,
          upsell: {
            plan: "extra_slots_10",
            name: "+10 Extra Bot Slots",
            price_display: "$4.99/month",
            price_cents: 499,
            slots: 10,
          },
        },
        402
      );
    }
  } else if (hasProTier) {
    const proMaxBots = PRO_LIMIT + extraBotSlots;
    if (currentBotCount >= proMaxBots) {
      const msg = `You have reached the Pro plan limit (${proMaxBots} bots). Upgrade to Studio ($14.99/mo) or add +10 Extra Bot Slots ($4.99/mo) to connect more bots.`;
      return c.json(
        {
          code: "PLAN_LIMIT_REACHED",
          message: msg,
          error: msg,
          limit: proMaxBots,
          extra_bot_slots: extraBotSlots,
        },
        402
      );
    }
  } else {
    const starterMaxBots = STARTER_LIMIT + extraBotSlots;
    if (currentBotCount >= starterMaxBots) {
      const msg = `You have reached the Free Starter limit (${starterMaxBots} bots). Upgrade to Pro ($5.99/mo) or Studio ($14.99/mo) to connect more bots.`;
      return c.json(
        {
          code: "PLAN_LIMIT_REACHED",
          message: msg,
          error: msg,
          limit: starterMaxBots,
          extra_bot_slots: extraBotSlots,
        },
        402
      );
    }
  }

  let discordId = "000000000000000000";
  let botUsername = customName || "Discord Bot";
  let botAvatar: string | null = null;

  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const data: any = await res.json();
      discordId = String(data.id || "").trim();
      if (!customName) botUsername = data.username;
      botAvatar = data.avatar || null;
    } else {
      return c.json(
        { error: "Invalid Discord Bot Token. Please verify the token in the Discord Developer Portal." },
        400
      );
    }
  } catch (err) {
    console.error("Failed to fetch Discord bot user", err);
  }

  // Enforce Blacklisted Discord Application ID Guard
  if (discordId && discordId !== "000000000000000000") {
    const blacklistedRows = await sql`
      SELECT application_id, reason
      FROM blacklisted_applications
      WHERE application_id = ${discordId}
      LIMIT 1
    `.catch(() => []);
    if (blacklistedRows && blacklistedRows.length > 0) {
      return c.json(
        {
          code: "BOT_APPLICATION_BLACKLISTED",
          error:
            "This Discord Application ID has been blacklisted by Veloce Trust & Safety and cannot be connected.",
          message:
            "This Discord Application ID has been blacklisted by Veloce Trust & Safety and cannot be connected.",
        },
        403
      );
    }
  }

  const appId = "app_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  const initialPlan = hasStudioTier ? "studio" : hasProTier ? "pro" : "free";
  const initialCustomBranding = hasStudioTier || hasProTier;

  const rows = await sql`
    INSERT INTO apps (
      id, user_id, owner_user_id, creator_user_id, name, discord_id, discord_token, discord_public_key, discord_avatar, enabled, plan, custom_branding, created_at, updated_at
    ) VALUES (
      ${appId},
      ${authUser.discord_id},
      ${authUser.id},
      ${authUser.id},
      ${botUsername},
      ${discordId},
      ${token},
      ${publicKey || null},
      ${botAvatar},
      true,
      ${initialPlan},
      ${initialCustomBranding},
      NOW(),
      NOW()
    )
    RETURNING id, user_id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, discord_token, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
  `;

  const createdApp = rows[0];
  c.executionCtx.waitUntil(
    (async () => {
      await syncSlashCommandsWithDiscord(sql, createdApp);
      await maintainBotGateway(createdApp, sql, 25000);
    })()
  );

  return c.json(sanitizeBotForClient(createdApp), 201);
}

app.post("/api/bots", handleCreateUserBot);
app.post("/v1/apps", handleCreateUserBot);

async function handleUpdateUserBot(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);
  if (authUser.is_banned) return c.json({ error: "Account suspended" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json();

  // Strict IDOR protection: WHERE id = ? AND user_id = verifiedSession.discord_id
  const existing = await getOwnedBotOrNull(sql, id, authUser);
  if (!existing) return c.json({ error: "Bot not found" }, 404);

  // If rotating/updating the bot token, verify the application_id is not blacklisted
  if (body.token && typeof body.token === "string" && body.token.trim()) {
    const newToken = body.token.trim();
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${newToken}` },
    }).catch(() => null);
    if (!res || !res.ok) {
      return c.json(
        { error: "Invalid Discord Bot Token. Please verify the token in the Discord Developer Portal." },
        400
      );
    }
    const tokenBot: any = await res.json();
    const candidateAppId = String(tokenBot.id || existing.discord_id || "").trim();
    const blacklistedRows = await sql`
      SELECT application_id FROM blacklisted_applications WHERE application_id = ${candidateAppId} LIMIT 1
    `.catch(() => []);
    if (blacklistedRows && blacklistedRows.length > 0) {
      return c.json(
        {
          code: "BOT_APPLICATION_BLACKLISTED",
          error:
            "This Discord Application ID has been blacklisted by Veloce Trust & Safety and cannot be connected.",
        },
        403
      );
    }
  }

  // Anti-Privilege-Escalation Guard: Never allow client PATCH to upgrade plan, role, or extra_bot_slots
  const currentPlan = existing.plan || "free";
  const canUseCustomBranding = currentPlan === "pro" || currentPlan === "studio";
  const nextCustomBranding = canUseCustomBranding
    ? body.custom_branding ?? existing.custom_branding ?? false
    : false;

  if (body.enabled === false) {
    disconnectBotGatewayImmediate(id);
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(undefined, existing.discord_token)
    );
  }

  const rows = await sql`
    UPDATE apps
    SET 
      name = COALESCE(${body.name ?? null}, name),
      description = COALESCE(${body.description ?? null}, description),
      enabled = COALESCE(${body.enabled ?? null}, enabled),
      discord_public_key = CASE WHEN ${body.public_key !== undefined} THEN ${body.public_key || null} ELSE discord_public_key END,
      discord_token = CASE WHEN ${body.token !== undefined && !!body.token} THEN ${body.token.trim()} ELSE discord_token END,
      custom_branding = ${nextCustomBranding},
      discord_status = CASE WHEN ${body.discord_status !== undefined} THEN ${JSON.stringify(body.discord_status)}::jsonb ELSE discord_status END,
      updated_at = NOW()
    WHERE id = ${id} AND (user_id = ${authUser.discord_id} OR owner_user_id = ${authUser.id})
    RETURNING id, user_id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, discord_token, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
  `;

  if (!rows || rows.length === 0) return c.json({ error: "Bot not found" }, 404);
  return c.json(sanitizeBotForClient(rows[0]));
}

app.patch("/api/bots/:id", handleUpdateUserBot);
app.patch("/v1/apps/:id", handleUpdateUserBot);

async function handleDeleteUserBot(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);
  if (authUser.is_banned) return c.json({ error: "Account suspended" }, 403);

  const id = c.req.param("id");
  const existing = await getOwnedBotOrNull(sql, id, authUser);
  if (!existing) return c.json({ error: "Bot not found" }, 404);

  disconnectBotGatewayImmediate(id);

  await sql`DELETE FROM commands WHERE app_id = ${id}`;
  await sql`DELETE FROM event_listeners WHERE app_id = ${id}`.catch(() => {});
  await sql`DELETE FROM logs WHERE app_id = ${id}`.catch(() => {});
  await sql`
    DELETE FROM apps
    WHERE id = ${id} AND (user_id = ${authUser.discord_id} OR owner_user_id = ${authUser.id})
  `;

  c.executionCtx.waitUntil(
    forceDiscordBotOfflineAndClearCommands(existing.discord_id, existing.discord_token)
  );

  return c.json({ success: true });
}

app.delete("/api/bots/:id", handleDeleteUserBot);
app.delete("/v1/apps/:id", handleDeleteUserBot);

// Commands Management (Strictly Scoped to Bot Owner)
app.get("/v1/apps/:app_id/commands", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const rows = await sql`
    SELECT id, app_id, creator_user_id, name, description, enabled, flow_source, created_at, updated_at
    FROM commands
    WHERE app_id = ${appId}
    ORDER BY created_at DESC
  `;
  return c.json(rows);
});

app.post("/v1/apps/:app_id/commands", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const body = await c.req.json();
  const cmdId = "cmd_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

  const rows = await sql`
    INSERT INTO commands (
      id, app_id, creator_user_id, user_id, name, description, flow_source, enabled, created_at, updated_at
    ) VALUES (
      ${cmdId},
      ${appId},
      ${authUser.id},
      ${authUser.discord_id},
      ${body.name},
      ${body.description || ""},
      ${JSON.stringify(body.flow_source || { nodes: [], edges: [] })},
      true,
      NOW(),
      NOW()
    )
    RETURNING id, app_id, creator_user_id, name, description, enabled, flow_source, created_at, updated_at
  `;

  c.executionCtx.waitUntil(syncSlashCommandsWithDiscord(sql, ownedBot));

  return c.json(rows[0], 201);
});

app.patch("/v1/apps/:app_id/commands/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const id = c.req.param("id");
  const body = await c.req.json();

  const rows = await sql`
    UPDATE commands
    SET
      name = COALESCE(${body.name ?? null}, name),
      description = COALESCE(${body.description ?? null}, description),
      enabled = COALESCE(${body.enabled ?? null}, enabled),
      flow_source = CASE WHEN ${body.flow_source !== undefined} THEN ${JSON.stringify(body.flow_source)}::jsonb ELSE flow_source END,
      updated_at = NOW()
    WHERE id = ${id} AND app_id = ${appId}
    RETURNING id, app_id, creator_user_id, name, description, enabled, flow_source, created_at, updated_at
  `;

  if (!rows || rows.length === 0) return c.json({ error: "Command not found" }, 404);

  c.executionCtx.waitUntil(syncSlashCommandsWithDiscord(sql, ownedBot));

  return c.json(rows[0]);
});

app.delete("/v1/apps/:app_id/commands/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const id = c.req.param("id");
  await sql`DELETE FROM commands WHERE id = ${id} AND app_id = ${appId}`;
  return c.json({ success: true });
});

app.post("/v1/apps/:app_id/commands/deploy", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const botApp = await getOwnedBotOrNull(sql, appId, authUser);
  if (!botApp) {
    return c.json({ error: "Application not found" }, 404);
  }

  const result = await syncSlashCommandsWithDiscord(sql, botApp);
  c.executionCtx.waitUntil(maintainBotGateway(botApp, sql, 25000));

  return c.json({
    queued: true,
    message: result.synced
      ? `Deployed ${result.count} slash command(s) to Discord & connected bot gateway`
      : `Prepared ${result.count} command(s) for Discord deployment`,
  });
});

// Event Listeners Management (Strictly Scoped to Bot Owner)
app.get("/v1/apps/:app_id/events", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  try {
    const rows = await sql`
      SELECT id, app_id, creator_user_id, source, type, description, enabled, filter, flow_source, created_at, updated_at
      FROM event_listeners
      WHERE app_id = ${appId}
      ORDER BY created_at DESC
    `;
    return c.json(rows);
  } catch {
    return c.json([]);
  }
});

app.post("/v1/apps/:app_id/events", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const body = await c.req.json();
  const evId = "ev_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

  const rows = await sql`
    INSERT INTO event_listeners (
      id, app_id, creator_user_id, user_id, source, type, description, enabled, filter, flow_source, created_at, updated_at
    ) VALUES (
      ${evId},
      ${appId},
      ${authUser.id},
      ${authUser.discord_id},
      'discord',
      ${body.type || "message_create"},
      ${body.description || ""},
      true,
      ${JSON.stringify(body.filter || {})},
      ${JSON.stringify(body.flow_source || { nodes: [], edges: [] })},
      NOW(),
      NOW()
    )
    RETURNING id, app_id, creator_user_id, source, type, description, enabled, filter, flow_source, created_at, updated_at
  `;

  return c.json(rows[0], 201);
});

app.patch("/v1/apps/:app_id/events/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const id = c.req.param("id");
  const body = await c.req.json();

  const rows = await sql`
    UPDATE event_listeners
    SET
      type = COALESCE(${body.type ?? null}, type),
      description = COALESCE(${body.description ?? null}, description),
      enabled = COALESCE(${body.enabled ?? null}, enabled),
      flow_source = CASE WHEN ${body.flow_source !== undefined} THEN ${JSON.stringify(body.flow_source)}::jsonb ELSE flow_source END,
      updated_at = NOW()
    WHERE id = ${id} AND app_id = ${appId}
    RETURNING id, app_id, creator_user_id, source, type, description, enabled, filter, flow_source, created_at, updated_at
  `;

  if (!rows || rows.length === 0) return c.json({ error: "Event listener not found" }, 404);
  return c.json(rows[0]);
});

app.delete("/v1/apps/:app_id/events/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const id = c.req.param("id");
  await sql`DELETE FROM event_listeners WHERE id = ${id} AND app_id = ${appId}`;
  return c.json({ success: true });
});

// Logs, Guilds & Gateway Telemetry (Strictly Scoped to Bot Owner)
app.get("/v1/apps/:app_id/logs", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
  const rows = await sql`
    SELECT id, app_id, message, level, details, created_at
    FROM logs
    WHERE app_id = ${appId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return c.json(rows);
});

app.get("/v1/apps/:app_id/guilds", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const ownedBot = await getOwnedBotOrNull(sql, appId, authUser);
  if (!ownedBot) return c.json({ error: "Bot not found" }, 404);

  try {
    if (ownedBot.discord_token) {
      const res = await fetch("https://discord.com/api/v10/users/@me/guilds?with_counts=true", {
        headers: { Authorization: `Bot ${ownedBot.discord_token}` },
      });
      if (res.ok) {
        const guilds = await res.json();
        return c.json(guilds);
      }
    }
  } catch (err) {
    console.error("Failed to fetch bot guilds", err);
  }
  return c.json([]);
});

app.get("/v1/apps/:app_id/gateway", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const appId = c.req.param("app_id");
  const botApp = await getOwnedBotOrNull(sql, appId, authUser);
  if (!botApp) return c.json({ error: "Bot not found" }, 404);

  const connected = !!botApp.enabled;
  if (connected) {
    c.executionCtx.waitUntil(maintainBotGateway(botApp, sql, 25000));
  }

  return c.json({
    connected,
    serverless: true,
    last_ping_at: new Date().toISOString(),
    guild_count: 1,
  });
});

// ============================================================================
// Task 5: Multi-Rank Super Admin & Staff Panel (/api/admin/*) with Hardened RBAC
// ============================================================================

async function requireStaffRole(
  c: any,
  sql: any,
  minimumRole: StaffRole
): Promise<{ user: AuthenticatedUser } | { errorResponse: Response }> {
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) {
    return { errorResponse: c.json({ error: "Unauthorized: Valid session required" }, 401) };
  }
  if (authUser.is_banned) {
    return { errorResponse: c.json({ error: "Forbidden: Account suspended" }, 403) };
  }
  if (!hasRequiredRole(authUser.role, minimumRole)) {
    return {
      errorResponse: c.json(
        {
          error: `Forbidden: Requires ${minimumRole} clearance or higher (your role: ${authUser.role})`,
        },
        403
      ),
    };
  }
  return { user: authUser };
}

// 1. Admin Overview (SUPPORT, MODERATOR, ADMIN, FOUNDER)
app.get("/api/admin/overview", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "SUPPORT");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const [usersList, botsList, spikeBots, auditLogs, blacklistedApps] = await Promise.all([
    sql`
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.discord_id,
        u.discord_username,
        u.discord_avatar,
        u.role,
        u.plan,
        COALESCE(u.extra_bot_slots, 0) AS extra_bot_slots,
        COALESCE(u.is_banned, false) AS is_banned,
        u.ban_reason,
        u.created_at,
        u.updated_at,
        (
          SELECT COUNT(*)::int
          FROM apps a
          WHERE a.user_id = u.discord_id OR a.owner_user_id = u.id
        ) AS bot_count
      FROM users u
      ORDER BY
        CASE u.role
          WHEN 'FOUNDER' THEN 5
          WHEN 'ADMIN' THEN 4
          WHEN 'MODERATOR' THEN 3
          WHEN 'SUPPORT' THEN 2
          ELSE 1
        END DESC,
        u.created_at DESC
      LIMIT 200
    `.catch(() => []),
    sql`
      SELECT
        a.id,
        a.user_id,
        a.owner_user_id,
        u.discord_username AS owner_username,
        u.display_name AS owner_display_name,
        a.name,
        a.description,
        a.enabled,
        a.discord_id,
        a.discord_avatar,
        a.discord_token,
        a.plan,
        a.custom_branding,
        a.subscription_status,
        a.created_at,
        a.updated_at,
        (SELECT COUNT(*)::int FROM commands c WHERE c.app_id = a.id) AS command_count,
        (SELECT COUNT(*)::int FROM logs l WHERE l.app_id = a.id AND l.level = 'error') AS error_count
      FROM apps a
      LEFT JOIN users u ON u.discord_id = a.user_id OR u.id = a.owner_user_id
      ORDER BY a.created_at DESC
      LIMIT 200
    `.catch(() => []),
    sql`
      SELECT
        a.id AS app_id,
        a.name AS bot_name,
        a.discord_id AS bot_discord_id,
        a.enabled,
        COALESCE(a.user_id, REPLACE(a.owner_user_id, 'usr_', '')) AS owner_discord_id,
        u.discord_username AS owner_username,
        COALESCE(u.is_banned, false) AS owner_banned,
        COUNT(l.id)::int AS total_events_1h,
        COUNT(l.id) FILTER (WHERE l.message ILIKE '%429%' OR l.message ILIKE '%rate limit%')::int AS rate_limit_429_count,
        COUNT(l.id) FILTER (WHERE l.level = 'error')::int AS error_count,
        COALESCE(MAX(l.created_at), a.updated_at) AS last_activity_at
      FROM apps a
      LEFT JOIN users u ON u.discord_id = a.user_id OR u.id = a.owner_user_id
      LEFT JOIN logs l ON l.app_id = a.id AND l.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY a.id, a.name, a.discord_id, a.enabled, a.user_id, a.owner_user_id, u.discord_username, u.is_banned, a.updated_at
      ORDER BY rate_limit_429_count DESC, total_events_1h DESC
      LIMIT 50
    `.catch(() => []),
    sql`
      SELECT id, actor_discord_id, actor_username, actor_role, target_id, action_type, details, ip_address, created_at
      FROM staff_audit_logs
      ORDER BY created_at DESC
      LIMIT 100
    `.catch(() => []),
    sql`
      SELECT application_id, reason, blacklisted_by, created_at
      FROM blacklisted_applications
      ORDER BY created_at DESC
      LIMIT 100
    `.catch(() => []),
  ]);

  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();
  const normalizedUsers = (usersList || []).map((u: any) => ({
    ...u,
    role: String(u.discord_id) === founderId ? "FOUNDER" : normalizeStaffRole(u.role),
    extra_bot_slots: Math.max(0, Number(u.extra_bot_slots || 0)),
    bot_count: Number(u.bot_count || 0),
    is_banned: String(u.discord_id) === founderId ? false : Boolean(u.is_banned),
  }));

  const sanitizedBots = (botsList || []).map((b: any) => ({
    ...sanitizeBotForClient(b),
    command_count: Number(b.command_count || 0),
    error_count: Number(b.error_count || 0),
  }));

  return c.json({
    viewer: staff,
    staff_user: staff,
    founder_discord_id: founderId,
    users: normalizedUsers,
    bots: sanitizedBots,
    abuse_radar: spikeBots || [],
    audit_logs: auditLogs || [],
    blacklisted_applications: blacklistedApps || [],
  });
});

// 2. Role & Staff Access Manager (FOUNDER ONLY)
app.post("/api/admin/staff/role", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "FOUNDER");
  if ("errorResponse" in check) return check.errorResponse;
  const founder = check.user;

  const body = await c.req.json();
  const targetDiscordId = String(body.discord_id || "").trim();
  const requestedRole = normalizeStaffRole(body.role);
  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();

  if (!/^\d{17,20}$/.test(targetDiscordId)) {
    return c.json({ error: "A valid 17–20 digit Discord User ID is required" }, 400);
  }

  // Anti-Privilege-Escalation Guard: Founder cannot be demoted
  if (targetDiscordId === founderId && requestedRole !== "FOUNDER") {
    return c.json({ error: "Cannot demote or modify the Founder's role" }, 403);
  }

  const finalRole: StaffRole = targetDiscordId === founderId ? "FOUNDER" : requestedRole;
  const userId = `usr_${targetDiscordId}`;

  // Upsert user so Founder can pre-authorize future staff before their first login
  const rows = await sql`
    INSERT INTO users (
      id, email, display_name, discord_id, discord_username, role, created_at, updated_at
    ) VALUES (
      ${userId},
      ${`${targetDiscordId}@discord.user`},
      ${body.display_name || `Discord User (${targetDiscordId})`},
      ${targetDiscordId},
      ${body.username || targetDiscordId},
      ${finalRole},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      role = ${finalRole},
      updated_at = NOW()
    RETURNING id, email, display_name, discord_id, discord_username, discord_avatar, role, plan, COALESCE(extra_bot_slots, 0) AS extra_bot_slots, COALESCE(is_banned, false) AS is_banned, created_at
  `;

  await writeStaffAuditLog(
    sql,
    founder,
    targetDiscordId,
    finalRole === "USER" ? "REVOKE_STAFF_ROLE" : "ASSIGN_STAFF_ROLE",
    { assigned_role: finalRole, target_discord_id: targetDiscordId },
    getClientIp(c)
  );

  return c.json({ success: true, user: rows[0] });
});

// 3. Global Bot Inspector: View Bot Error & Execution Logs (SUPPORT, MODERATOR, ADMIN, FOUNDER)
app.get("/api/admin/bots/:id/logs", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "SUPPORT");
  if ("errorResponse" in check) return check.errorResponse;

  const botId = c.req.param("id");
  const rows = await sql`
    SELECT id, app_id, user_id, message, level, details, created_at
    FROM logs
    WHERE app_id = ${botId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return c.json(rows || []);
});

// 4. Global Bot Inspector: Disconnect / Suspend or Resume Bot (MODERATOR, ADMIN, FOUNDER)
app.post("/api/admin/bots/:id/suspend", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "MODERATOR");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const botId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const shouldEnable = body.enabled === true;

  const existingRows = await sql`
    SELECT id, user_id, owner_user_id, name, discord_id, discord_token, enabled
    FROM apps
    WHERE id = ${botId}
    LIMIT 1
  `;
  if (!existingRows || existingRows.length === 0) {
    return c.json({ error: "Bot not found" }, 404);
  }
  const bot = existingRows[0];

  // Prevent non-Founder staff from suspending the Founder's own bots
  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();
  const botOwnerDiscordId =
    bot.user_id || String(bot.owner_user_id || "").replace(/^usr_/, "");
  if (botOwnerDiscordId === founderId && staff.role !== "FOUNDER" && !shouldEnable) {
    return c.json({ error: "Forbidden: Cannot suspend bots owned by the Founder" }, 403);
  }

  if (!shouldEnable) {
    disconnectBotGatewayImmediate(botId);
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(undefined, bot.discord_token)
    );
  }

  const updated = await sql`
    UPDATE apps
    SET enabled = ${shouldEnable}, updated_at = NOW()
    WHERE id = ${botId}
    RETURNING id, user_id, owner_user_id, name, description, enabled, discord_id, discord_avatar, discord_token, plan, custom_branding, created_at, updated_at
  `;

  await writeStaffAuditLog(
    sql,
    staff,
    botId,
    shouldEnable ? "RESUME_BOT" : "SUSPEND_BOT",
    { bot_name: bot.name, owner_discord_id: botOwnerDiscordId, enabled: shouldEnable },
    getClientIp(c)
  );

  return c.json({
    success: true,
    bot: sanitizeBotForClient(updated[0]),
  });
});

// 5. Token Vault: 1-Click Validate & Inspect Token (SUPPORT, MODERATOR, ADMIN, FOUNDER)
// Strictly write-only token hygiene: NEVER sends the raw bot_token to the browser.
app.post("/api/admin/bots/:id/validate-token", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "SUPPORT");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const botId = c.req.param("id");
  const rows = await sql`
    SELECT id, name, discord_id, discord_avatar, user_id, owner_user_id, discord_token
    FROM apps
    WHERE id = ${botId}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) {
    return c.json({ error: "Bot not found" }, 404);
  }
  const bot = rows[0];
  const rawToken = bot.discord_token ? String(bot.discord_token).trim() : "";

  if (!rawToken) {
    await writeStaffAuditLog(
      sql,
      staff,
      botId,
      "VALIDATE_BOT_TOKEN",
      { bot_name: bot.name, token_status: "REVOKED_OR_INVALID", reason: "No token stored" },
      getClientIp(c)
    );
    return c.json({
      bot_db_id: bot.id,
      token_status: "REVOKED_OR_INVALID" as const,
      bot_username: bot.name || null,
      bot_id: bot.discord_id || null,
      avatar: bot.discord_avatar || null,
      approximate_guild_count: 0,
      flags: 0,
    });
  }

  let tokenStatus: "VALID" | "REVOKED_OR_INVALID" = "REVOKED_OR_INVALID";
  let botUsername: string | null = bot.name || null;
  let discordBotId: string | null = bot.discord_id || null;
  let avatar: string | null = bot.discord_avatar || null;
  let approximateGuildCount: number | null = null;
  let flags: number | null = null;

  try {
    const [userRes, appRes] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${rawToken}` },
      }),
      fetch("https://discord.com/api/v10/applications/@me", {
        headers: { Authorization: `Bot ${rawToken}` },
      }),
    ]);

    if (userRes.ok) {
      tokenStatus = "VALID";
      const userData: any = await userRes.json();
      botUsername = userData.username || botUsername;
      discordBotId = userData.id || discordBotId;
      avatar = userData.avatar ?? avatar;
      if (typeof userData.flags === "number") {
        flags = userData.flags;
      }
    } else if (userRes.status === 401) {
      tokenStatus = "REVOKED_OR_INVALID";
    }

    if (appRes.ok) {
      tokenStatus = "VALID";
      const appData: any = await appRes.json();
      if (typeof appData.approximate_guild_count === "number") {
        approximateGuildCount = appData.approximate_guild_count;
      }
      if (typeof appData.flags === "number") {
        flags = appData.flags;
      }
      if (!discordBotId && appData.id) {
        discordBotId = appData.id;
      }
    }
  } catch (err) {
    console.error("Failed to validate Discord bot token against Discord API", err);
  }

  await writeStaffAuditLog(
    sql,
    staff,
    botId,
    "VALIDATE_BOT_TOKEN",
    {
      bot_name: botUsername,
      bot_discord_id: discordBotId,
      token_status: tokenStatus,
      approximate_guild_count: approximateGuildCount,
      flags,
    },
    getClientIp(c)
  );

  return c.json({
    bot_db_id: bot.id,
    token_status: tokenStatus,
    bot_username: botUsername,
    bot_id: discordBotId,
    avatar,
    approximate_guild_count: approximateGuildCount ?? 0,
    flags: flags ?? 0,
  });
});

// 6. Token Vault: 1-Click Wipe Token & Disconnect (MODERATOR, ADMIN, FOUNDER)
app.post("/api/admin/bots/:id/wipe-token", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "MODERATOR");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const botId = c.req.param("id");
  const existingRows = await sql`
    SELECT id, user_id, owner_user_id, name, discord_id, discord_token
    FROM apps
    WHERE id = ${botId}
    LIMIT 1
  `;
  if (!existingRows || existingRows.length === 0) {
    return c.json({ error: "Bot not found" }, 404);
  }
  const bot = existingRows[0];

  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();
  const botOwnerDiscordId =
    bot.user_id || String(bot.owner_user_id || "").replace(/^usr_/, "");
  if (botOwnerDiscordId === founderId && staff.role !== "FOUNDER") {
    return c.json({ error: "Forbidden: Cannot wipe tokens on bots owned by the Founder" }, 403);
  }

  disconnectBotGatewayImmediate(botId);
  if (bot.discord_token) {
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(bot.discord_id, bot.discord_token)
    );
  }

  const updated = await sql`
    UPDATE apps
    SET discord_token = NULL, enabled = false, updated_at = NOW()
    WHERE id = ${botId}
    RETURNING id, user_id, owner_user_id, name, description, enabled, discord_id, discord_avatar, discord_token, plan, custom_branding, created_at, updated_at
  `;

  await writeStaffAuditLog(
    sql,
    staff,
    botId,
    "WIPE_BOT_TOKEN",
    {
      bot_name: bot.name,
      bot_discord_id: bot.discord_id,
      owner_discord_id: botOwnerDiscordId,
    },
    getClientIp(c)
  );

  return c.json({
    success: true,
    bot: sanitizeBotForClient(updated[0]),
  });
});

// 7. Token Vault: 1-Click Wipe & Blacklist Bot Application ID (ADMIN & FOUNDER ONLY)
app.post("/api/admin/bots/:id/blacklist", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "ADMIN");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const botId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || "Blacklisted via Super Admin Token Vault").trim();

  const existingRows = await sql`
    SELECT id, user_id, owner_user_id, name, discord_id, discord_token
    FROM apps
    WHERE id = ${botId}
    LIMIT 1
  `;
  if (!existingRows || existingRows.length === 0) {
    return c.json({ error: "Bot not found" }, 404);
  }
  const bot = existingRows[0];

  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();
  const botOwnerDiscordId =
    bot.user_id || String(bot.owner_user_id || "").replace(/^usr_/, "");
  if (botOwnerDiscordId === founderId && staff.role !== "FOUNDER") {
    return c.json({ error: "Forbidden: Cannot blacklist bots owned by the Founder" }, 403);
  }

  const applicationId = String(bot.discord_id || "").trim();
  if (applicationId && applicationId !== "000000000000000000") {
    await sql`
      INSERT INTO blacklisted_applications (application_id, reason, blacklisted_by, created_at)
      VALUES (${applicationId}, ${reason}, ${staff.discord_id}, NOW())
      ON CONFLICT (application_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        blacklisted_by = EXCLUDED.blacklisted_by,
        created_at = NOW()
    `;
  }

  disconnectBotGatewayImmediate(botId);
  await sql`DELETE FROM commands WHERE app_id = ${botId}`.catch(() => {});
  await sql`DELETE FROM event_listeners WHERE app_id = ${botId}`.catch(() => {});
  await sql`DELETE FROM logs WHERE app_id = ${botId}`.catch(() => {});
  await sql`DELETE FROM apps WHERE id = ${botId}`;

  if (bot.discord_token) {
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(bot.discord_id, bot.discord_token)
    );
  }

  await writeStaffAuditLog(
    sql,
    staff,
    applicationId || botId,
    "WIPE_AND_BLACKLIST_BOT_ID",
    {
      bot_db_id: botId,
      bot_name: bot.name,
      application_id: applicationId,
      owner_discord_id: botOwnerDiscordId,
      reason,
    },
    getClientIp(c)
  );

  return c.json({
    success: true,
    deleted_bot_id: botId,
    blacklisted_application_id: applicationId,
  });
});

// 8. Permanently Purge Bot (FOUNDER ONLY)
app.delete("/api/admin/bots/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "FOUNDER");
  if ("errorResponse" in check) return check.errorResponse;
  const founder = check.user;

  const botId = c.req.param("id");
  const existing = await sql`
    SELECT id, name, user_id, owner_user_id, discord_id, discord_token
    FROM apps
    WHERE id = ${botId}
    LIMIT 1
  `;
  if (!existing || existing.length === 0) {
    return c.json({ error: "Bot not found" }, 404);
  }
  const bot = existing[0];

  disconnectBotGatewayImmediate(botId);
  await sql`DELETE FROM commands WHERE app_id = ${botId}`;
  await sql`DELETE FROM event_listeners WHERE app_id = ${botId}`.catch(() => {});
  await sql`DELETE FROM logs WHERE app_id = ${botId}`.catch(() => {});
  await sql`DELETE FROM apps WHERE id = ${botId}`;

  c.executionCtx.waitUntil(
    forceDiscordBotOfflineAndClearCommands(bot.discord_id, bot.discord_token)
  );

  await writeStaffAuditLog(
    sql,
    founder,
    botId,
    "PURGE_BOT",
    {
      bot_name: bot.name,
      bot_discord_id: bot.discord_id,
      owner_discord_id: bot.user_id || String(bot.owner_user_id || "").replace(/^usr_/, ""),
    },
    getClientIp(c)
  );

  return c.json({ success: true, deleted_bot_id: botId });
});

// 7. User Directory & Plan Override / Ban Manager (ADMIN & FOUNDER)
app.patch("/api/admin/users/:discord_id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "ADMIN");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const targetDiscordId = c.req.param("discord_id");
  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();

  // Anti-Privilege-Escalation Guard: No ADMIN can ever modify, ban, or demote the FOUNDER
  if (targetDiscordId === founderId && staff.role !== "FOUNDER") {
    return c.json(
      { error: "Forbidden: Cannot modify, ban, or alter the Founder account" },
      403
    );
  }

  const body = await c.req.json();
  const nextPlan =
    body.plan === "studio" || body.plan === "pro" || body.plan === "free"
      ? body.plan
      : undefined;
  const nextExtraSlots =
    body.extra_bot_slots !== undefined
      ? Math.max(0, parseInt(String(body.extra_bot_slots), 10) || 0)
      : undefined;
  const nextBanned =
    targetDiscordId === founderId
      ? false
      : typeof body.is_banned === "boolean"
      ? body.is_banned
      : undefined;

  const userId = `usr_${targetDiscordId}`;

  const updatedRows = await sql`
    UPDATE users
    SET
      plan = COALESCE(${nextPlan ?? null}, plan),
      extra_bot_slots = COALESCE(${nextExtraSlots ?? null}, extra_bot_slots),
      is_banned = COALESCE(${nextBanned ?? null}, is_banned),
      ban_reason = CASE WHEN ${body.ban_reason !== undefined} THEN ${body.ban_reason} ELSE ban_reason END,
      updated_at = NOW()
    WHERE discord_id = ${targetDiscordId} OR id = ${userId}
    RETURNING id, email, display_name, discord_id, discord_username, discord_avatar, role, plan, COALESCE(extra_bot_slots, 0) AS extra_bot_slots, COALESCE(is_banned, false) AS is_banned, ban_reason, created_at
  `;

  if (!updatedRows || updatedRows.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  if (nextPlan) {
    const unlockBranding = nextPlan === "pro" || nextPlan === "studio";
    await sql`
      UPDATE apps
      SET plan = ${nextPlan}, custom_branding = ${unlockBranding}, updated_at = NOW()
      WHERE user_id = ${targetDiscordId} OR owner_user_id = ${userId}
    `.catch(() => {});
  }

  if (nextBanned === true) {
    const userBots = await sql`
      SELECT id, discord_id, discord_token
      FROM apps
      WHERE user_id = ${targetDiscordId} OR owner_user_id = ${userId}
    `.catch(() => []);
    for (const b of userBots || []) {
      disconnectBotGatewayImmediate(b.id);
      c.executionCtx.waitUntil(
        forceDiscordBotOfflineAndClearCommands(undefined, b.discord_token)
      );
    }
    await sql`
      UPDATE apps SET enabled = false, updated_at = NOW()
      WHERE user_id = ${targetDiscordId} OR owner_user_id = ${userId}
    `.catch(() => {});
  }

  await writeStaffAuditLog(
    sql,
    staff,
    targetDiscordId,
    nextBanned !== undefined
      ? nextBanned
        ? "BAN_USER"
        : "UNBAN_USER"
      : "OVERRIDE_USER_PLAN_OR_SLOTS",
    {
      plan: nextPlan,
      extra_bot_slots: nextExtraSlots,
      is_banned: nextBanned,
    },
    getClientIp(c)
  );

  return c.json({ success: true, user: updatedRows[0] });
});

// 8. Abuse & Rate-Limit Radar: 1-Click "Ban User & Purge All Bots" Emergency Switch (MODERATOR, ADMIN, FOUNDER)
app.post("/api/admin/abuse/ban-and-purge", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const check = await requireStaffRole(c, sql, "MODERATOR");
  if ("errorResponse" in check) return check.errorResponse;
  const staff = check.user;

  const body = await c.req.json();
  const targetDiscordId = String(body.discord_id || "").trim();
  const founderId = (c.env.FOUNDER_DISCORD_ID || DEFAULT_FOUNDER_DISCORD_ID).trim();

  if (!targetDiscordId) {
    return c.json({ error: "target discord_id is required" }, 400);
  }

  // Never allow banning or purging the Founder
  if (targetDiscordId === founderId) {
    return c.json({ error: "Forbidden: Cannot ban or purge the Founder account" }, 403);
  }

  const userId = `usr_${targetDiscordId}`;

  // Also prevent MODERATOR from banning an ADMIN
  const targetRows = await sql`
    SELECT id, role FROM users WHERE discord_id = ${targetDiscordId} OR id = ${userId} LIMIT 1
  `.catch(() => []);
  if (targetRows?.[0]) {
    const targetRole = normalizeStaffRole(targetRows[0].role);
    if (hasRequiredRole(targetRole, "ADMIN") && staff.role !== "FOUNDER") {
      return c.json({ error: "Forbidden: Only the Founder can ban an Admin" }, 403);
    }
  }

  // 1. Ban user account
  await sql`
    UPDATE users
    SET is_banned = true, ban_reason = ${body.reason || "Emergency Abuse & Raid Mitigation"}, updated_at = NOW()
    WHERE discord_id = ${targetDiscordId} OR id = ${userId}
  `.catch(() => {});

  // 2. Find, disconnect, and purge all bots owned by this user
  const userBots = await sql`
    SELECT id, name, discord_id, discord_token
    FROM apps
    WHERE user_id = ${targetDiscordId} OR owner_user_id = ${userId}
  `.catch(() => []);

  for (const b of userBots || []) {
    disconnectBotGatewayImmediate(b.id);
    await sql`DELETE FROM commands WHERE app_id = ${b.id}`.catch(() => {});
    await sql`DELETE FROM event_listeners WHERE app_id = ${b.id}`.catch(() => {});
    await sql`DELETE FROM logs WHERE app_id = ${b.id}`.catch(() => {});
    await sql`DELETE FROM apps WHERE id = ${b.id}`.catch(() => {});
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(b.discord_id, b.discord_token)
    );
  }

  await writeStaffAuditLog(
    sql,
    staff,
    targetDiscordId,
    "EMERGENCY_BAN_AND_PURGE",
    {
      purged_bot_count: (userBots || []).length,
      reason: body.reason || "Emergency Abuse & Raid Mitigation",
    },
    getClientIp(c)
  );

  return c.json({
    success: true,
    banned_discord_id: targetDiscordId,
    purged_bots: (userBots || []).length,
  });
});

// ============================================================================
// Dodo Payments Integration (Verified Webhooks + Self-Serve Expansion Packs)
// ============================================================================

async function handleVerifiedDodoWebhookRaw(
  sql: any,
  config: Awaited<ReturnType<typeof loadDodoRuntimeConfig>>,
  rawBody: string,
  headers: {
    "webhook-id": string;
    "webhook-signature": string;
    "webhook-timestamp": string;
  },
  waitUntil?: (promise: Promise<any>) => void
) {
  const client = createDodoClient(config);

  // 1. Verify Standard Webhooks signature on exact raw bytes using Dodo SDK
  const event: any = client.webhooks.unwrap(rawBody, {
    headers: {
      "webhook-id": headers["webhook-id"],
      "webhook-signature": headers["webhook-signature"],
      "webhook-timestamp": headers["webhook-timestamp"],
    },
  });

  const webhookId = headers["webhook-id"];
  const eventType: string = event.type || "unknown";
  const data: any = event.data || {};
  const metadata: any = data.metadata || {};
  let targetAppId: string | null = metadata.app_id || null;
  const targetDiscordId: string | null = metadata.discord_id || null;
  const targetUserId: string | null =
    metadata.user_id || (targetDiscordId ? `usr_${targetDiscordId}` : null);

  if (!targetAppId && data.subscription_id) {
    const subRows = await sql`
      SELECT id FROM apps WHERE dodo_subscription_id = ${data.subscription_id} LIMIT 1
    `;
    if (subRows && subRows.length > 0) targetAppId = subRows[0].id;
  }
  if (!targetAppId && data.customer?.customer_id) {
    const cusRows = await sql`
      SELECT id FROM apps WHERE dodo_customer_id = ${data.customer.customer_id} ORDER BY updated_at DESC LIMIT 1
    `;
    if (cusRows && cusRows.length > 0) targetAppId = cusRows[0].id;
  }

  // 2. Atomic idempotency claim via UNIQUE primary key on dodo_webhook_events
  const claim = await sql`
    INSERT INTO dodo_webhook_events (webhook_id, event_type, app_id, payload, created_at)
    VALUES (${webhookId}, ${eventType}, ${targetAppId}, ${rawBody}::jsonb, NOW())
    ON CONFLICT (webhook_id) DO NOTHING
    RETURNING webhook_id
  `;

  if (!claim || claim.length === 0) {
    return { received: true, duplicate: true, event_type: eventType, app_id: targetAppId };
  }

  // Determine plan slug from metadata or product_id
  const resolvePlanFromEvent = (): VelocePlanSlug => {
    if (metadata.plan === "extra_slots_10") return "extra_slots_10";
    if (metadata.plan === "studio") return "studio";
    if (metadata.plan === "pro") return "pro";
    if (
      data.product_id &&
      (data.product_id === config.extraSlotsProductId ||
        String(data.product_id).includes("extra_slots"))
    ) {
      return "extra_slots_10";
    }
    if (
      data.product_id &&
      (data.product_id === config.studioProductId ||
        String(data.product_id).includes("studio"))
    ) {
      return "studio";
    }
    if (data.total_amount === 499 || data.recurring_pre_tax_amount === 499) {
      return "extra_slots_10";
    }
    if (data.total_amount === 1499 || data.recurring_pre_tax_amount === 1499) {
      return "studio";
    }
    return "pro";
  };

  const planSlug = resolvePlanFromEvent();

  // Handle +10 Extra Bot Slots Expansion Pack ($4.99/mo) webhook
  if (
    planSlug === "extra_slots_10" &&
    (eventType === "subscription.active" || eventType === "payment.succeeded")
  ) {
    const slotsToAdd = Math.max(10, Number(metadata.extra_bot_slots || 10));
    if (targetUserId || targetDiscordId) {
      await sql`
        UPDATE users
        SET
          extra_bot_slots = COALESCE(extra_bot_slots, 0) + ${slotsToAdd},
          updated_at = NOW()
        WHERE id = ${targetUserId || ""} OR discord_id = ${targetDiscordId || ""}
      `.catch(() => {});
    } else if (targetAppId) {
      const appOwnerRows = await sql`
        SELECT owner_user_id, user_id FROM apps WHERE id = ${targetAppId} LIMIT 1
      `.catch(() => []);
      if (appOwnerRows?.[0]) {
        await sql`
          UPDATE users
          SET
            extra_bot_slots = COALESCE(extra_bot_slots, 0) + ${slotsToAdd},
            updated_at = NOW()
          WHERE id = ${appOwnerRows[0].owner_user_id} OR discord_id = ${appOwnerRows[0].user_id}
        `.catch(() => {});
      }
    }
    return {
      received: true,
      duplicate: false,
      event_type: eventType,
      plan: "extra_slots_10",
      extra_slots_added: slotsToAdd,
    };
  }

  if (targetAppId) {
    const subId = data.subscription_id || null;
    const cusId = data.customer?.customer_id || null;
    const nextBilling = data.next_billing_date || null;
    const tierSlug: "pro" | "studio" = planSlug === "studio" ? "studio" : "pro";

    switch (eventType) {
      case "subscription.active":
      case "subscription.renewed":
      case "subscription.unpaused": {
        const extraSlotsPurchased = Math.max(0, Number(metadata.extra_bot_slots || 0));
        const updatedAppRows = await sql`
          UPDATE apps
          SET
            plan = ${tierSlug},
            custom_branding = true,
            subscription_status = 'active',
            cancel_at_next_billing_date = false,
            dodo_subscription_id = COALESCE(${subId}, dodo_subscription_id),
            dodo_customer_id = COALESCE(${cusId}, dodo_customer_id),
            next_billing_date = COALESCE(${nextBilling}::timestamptz, next_billing_date, NOW() + INTERVAL '30 days'),
            updated_at = NOW()
          WHERE id = ${targetAppId}
          RETURNING owner_user_id, user_id
        `;
        const ownerId = updatedAppRows?.[0]?.owner_user_id || targetUserId || "";
        const ownerDiscordId = updatedAppRows?.[0]?.user_id || targetDiscordId || "";
        await sql`
          UPDATE users
          SET
            plan = CASE WHEN plan = 'studio' THEN 'studio' ELSE ${tierSlug} END,
            extra_bot_slots = COALESCE(extra_bot_slots, 0) + ${extraSlotsPurchased},
            updated_at = NOW()
          WHERE id = ${ownerId} OR discord_id = ${ownerDiscordId}
        `.catch(() => {});
        await sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${targetAppId},
            ${`Dodo Payments webhook (${eventType}): Upgraded bot to ${tierSlug.toUpperCase()} plan and unlocked custom branding.`},
            'info',
            ${JSON.stringify({ webhook_id: webhookId, subscription_id: subId, customer_id: cusId })}::jsonb,
            NOW()
          )
        `.catch(() => {});
        break;
      }

      case "subscription.plan_changed":
      case "subscription.updated": {
        const status = data.status || "active";
        const cancelAtEnd = Boolean(data.cancel_at_next_billing_date);
        await sql`
          UPDATE apps
          SET
            plan = ${status === "active" || status === "past_due" ? tierSlug : "free"},
            custom_branding = ${status === "active" || status === "past_due"},
            subscription_status = ${status},
            cancel_at_next_billing_date = ${cancelAtEnd},
            dodo_subscription_id = COALESCE(${subId}, dodo_subscription_id),
            dodo_customer_id = COALESCE(${cusId}, dodo_customer_id),
            next_billing_date = COALESCE(${nextBilling}::timestamptz, next_billing_date),
            updated_at = NOW()
          WHERE id = ${targetAppId}
        `;
        break;
      }

      case "subscription.past_due": {
        await sql`
          UPDATE apps
          SET
            subscription_status = 'past_due',
            updated_at = NOW()
          WHERE id = ${targetAppId}
        `;
        break;
      }

      case "subscription.on_hold":
      case "subscription.paused":
      case "subscription.expired":
      case "subscription.failed": {
        const nextStatus = eventType.replace("subscription.", "");
        await sql`
          UPDATE apps
          SET
            plan = 'free',
            custom_branding = false,
            subscription_status = ${nextStatus},
            updated_at = NOW()
          WHERE id = ${targetAppId}
        `;
        break;
      }

      case "subscription.cancelled": {
        const cancelAtPeriodEnd = Boolean(data.cancel_at_next_billing_date);
        if (cancelAtPeriodEnd) {
          await sql`
            UPDATE apps
            SET
              cancel_at_next_billing_date = true,
              next_billing_date = COALESCE(${nextBilling}::timestamptz, next_billing_date),
              updated_at = NOW()
            WHERE id = ${targetAppId}
          `;
        } else {
          await sql`
            UPDATE apps
            SET
              plan = 'free',
              custom_branding = false,
              subscription_status = 'cancelled',
              cancel_at_next_billing_date = false,
              updated_at = NOW()
            WHERE id = ${targetAppId}
          `;
        }
        break;
      }

      case "refund.succeeded": {
        await sql`
          UPDATE apps
          SET
            plan = 'free',
            custom_branding = false,
            subscription_status = 'cancelled',
            cancel_at_next_billing_date = false,
            updated_at = NOW()
          WHERE id = ${targetAppId}
        `;
        break;
      }
    }

    if (waitUntil) {
      waitUntil(
        (async () => {
          const updatedRows = await sql`
            SELECT id, name, discord_id, discord_token, enabled, plan, custom_branding, discord_status
            FROM apps
            WHERE id = ${targetAppId} AND enabled = true
            LIMIT 1
          `;
          if (updatedRows && updatedRows.length > 0) {
            disconnectBotGatewayImmediate(targetAppId!);
            await maintainBotGateway(updatedRows[0], sql, 15000);
          }
        })()
      );
    }
  }

  return {
    received: true,
    duplicate: false,
    event_type: eventType,
    app_id: targetAppId,
  };
}

// Official Dodo Webhook Endpoint (verifies Standard Webhooks signature on raw body)
async function handleDodoWebhookRoute(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const config = await loadDodoRuntimeConfig(sql, c.env);

  const rawBody = await c.req.text();
  const webhookId = c.req.header("webhook-id") || "";
  const webhookSignature = c.req.header("webhook-signature") || "";
  const webhookTimestamp = c.req.header("webhook-timestamp") || "";

  if (!webhookId || !webhookSignature || !webhookTimestamp) {
    return c.json({ error: "Missing required Standard Webhooks headers" }, 400);
  }

  try {
    const result = await handleVerifiedDodoWebhookRaw(
      sql,
      config,
      rawBody,
      {
        "webhook-id": webhookId,
        "webhook-signature": webhookSignature,
        "webhook-timestamp": webhookTimestamp,
      },
      (p) => c.executionCtx.waitUntil(p)
    );
    return c.json(result, 200);
  } catch (err: any) {
    console.error("Dodo webhook signature verification failed:", err);
    return c.json({ error: "Invalid webhook signature" }, 401);
  }
}

app.post("/v1/webhooks/dodo", handleDodoWebhookRoute);
app.post("/api/webhook/dodo", handleDodoWebhookRoute);

// Create Dodo Payments Checkout Session (Supports Pro $5.99, Studio $14.99, and +10 Extra Bot Slots $4.99)
async function handleCreateCheckoutSession(c: any) {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const appId = String(body.app_id || "").trim();
  const planSlug: VelocePlanSlug =
    body.plan === "extra_slots_10"
      ? "extra_slots_10"
      : body.plan === "studio"
      ? "studio"
      : "pro";

  const customerEmail = String(body.customer_email || authUser.email || "user@veloce.app").trim();
  const customerName = String(body.customer_name || authUser.display_name || "Discord User").trim();
  const discountCode = body.discount_code ? String(body.discount_code).trim() : undefined;

  let botApp: any = null;
  if (appId) {
    botApp = await getOwnedBotOrNull(sql, appId, authUser);
    if (!botApp) {
      return c.json({ error: "Bot application not found" }, 404);
    }
  }

  const config = await loadDodoRuntimeConfig(sql, c.env);
  const products = await ensureDodoProducts(sql, config).catch(() => ({
    proProductId: config.proProductId || "pdt_veloce_pro_599",
    studioProductId: config.studioProductId || "pdt_veloce_studio_1499",
    extraSlotsProductId: config.extraSlotsProductId || "pdt_veloce_extra_slots_499",
    isLiveApi: false,
  }));

  const productId =
    planSlug === "extra_slots_10"
      ? products.extraSlotsProductId
      : planSlug === "studio"
      ? products.studioProductId
      : products.proProductId;

  const origin = getPublicOrigin(c);
  const returnUrl = `${origin}/apps?checkout=success&plan=${encodeURIComponent(planSlug)}${
    appId ? `&app=${encodeURIComponent(appId)}` : ""
  }`;

  if (config.apiKey) {
    try {
      const client = createDodoClient(config);
      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: botApp?.dodo_customer_id
          ? { customer_id: botApp.dodo_customer_id }
          : { email: customerEmail, name: customerName },
        ...(discountCode ? { discount_codes: [discountCode] } : {}),
        feature_flags: {
          allow_discount_code: true,
        },
        customization: {
          theme: "dark",
          show_order_details: true,
        },
        metadata: {
          user_id: authUser.id,
          discord_id: authUser.discord_id,
          ...(appId ? { app_id: appId } : {}),
          plan: planSlug,
          ...(planSlug === "extra_slots_10" ? { extra_bot_slots: "10" } : {}),
        },
        return_url: returnUrl,
      });

      return c.json({
        mode: "dodo_hosted",
        environment: config.environment,
        session_id: session.session_id,
        checkout_url: session.checkout_url,
        product_id: productId,
        plan: planSlug,
      });
    } catch (err: any) {
      console.error("Dodo checkoutSessions.create error:", err);
      return c.json(
        {
          error: err?.message || "Failed to initialize checkout session.",
        },
        502
      );
    }
  }

  return c.json(
    {
      error: "Payment gateway is being configured. Please try again shortly.",
    },
    503
  );
}

app.post("/api/billing/checkout", handleCreateCheckoutSession);
app.post("/v1/billing/checkout", handleCreateCheckoutSession);

// Create Customer Portal Session (POST /v1/billing/portal)
app.post("/v1/billing/portal", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const authUser = await getVerifiedUser(c, sql);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const appId = String(body.app_id || "").trim();
  if (!appId) return c.json({ error: "app_id is required" }, 400);

  const botApp = await getOwnedBotOrNull(sql, appId, authUser);
  if (!botApp) return c.json({ error: "App not found" }, 404);

  const config = await loadDodoRuntimeConfig(sql, c.env);
  if (config.apiKey && botApp.dodo_customer_id) {
    try {
      const client = createDodoClient(config);
      const portal = await client.customers.customerPortal.create(
        botApp.dodo_customer_id,
        {
          return_url: `${getPublicOrigin(c)}/apps`,
        }
      );
      return c.json({ link: portal.link, mode: "dodo_hosted" });
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to open Customer Portal" }, 502);
    }
  }

  return c.json({ error: "No active billing portal session found for this bot." }, 404);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: any, env: Env, ctx: any) {
    const sql = neon(env.DATABASE_URL);
    ctx.waitUntil(syncAllBotsGateway(sql, 50000));
  },
};
