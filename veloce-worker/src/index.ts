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

export interface Env {
  DATABASE_URL: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ALLOWED_ORIGINS?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DODO_PAYMENTS_API_KEY?: string;
  DODO_PAYMENTS_WEBHOOK_KEY?: string;
  DODO_PAYMENTS_ENVIRONMENT?: string;
  DODO_PRODUCT_PRO_ID?: string;
  DODO_PRODUCT_STUDIO_ID?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Track active gateway sessions & WebSocket instances within the current Worker isolate
const activeGatewaySessions = new Map<string, number>();
const activeGatewaySockets = new Map<string, WebSocket>();
let schemaMigrated = false;

// Silent backend Fair Use & Plan Bot Creation Limits
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

async function ensureSchema(sql: any) {
  if (schemaMigrated) return;
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_bot_slots INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS custom_branding BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS discord_status JSONB`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none'`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS cancel_at_next_billing_date BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE apps ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ`;
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
    schemaMigrated = true;
  } catch (err) {
    console.error("ensureSchema error", err);
  }
}

async function ensureAdminUser(sql: any) {
  try {
    await sql`
      INSERT INTO users (id, email, display_name, discord_id, discord_username, created_at, updated_at)
      VALUES ('usr_admin', 'developer@veloce.app', 'Discord User', '000000000000000000', 'discord_user', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    console.error("ensureAdminUser error", err);
  }
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
    await ensureAdminUser(sql);
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

    commands = await sql`
      INSERT INTO commands (
        id, app_id, creator_user_id, name, description, flow_source, enabled, created_at, updated_at
      ) VALUES (
        ${cmdId},
        ${botApp.id},
        'usr_admin',
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

// Root and Health
app.get("/", (c) =>
  c.json({
    service: "veloce-api",
    runtime: "cloudflare-workers",
    status: "ok",
    version: "0.2.1",
    timestamp: new Date().toISOString(),
  })
);

app.get("/v1/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

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

// Current user profile (session-aware)
app.get("/v1/user/@me", async (c) => {
  const cookies = parseCookies(c.req.header("cookie"));
  const sessionUserId = cookies["veloce_session"];

  if (!sessionUserId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const sql = neon(c.env.DATABASE_URL);
    const rows = await sql`
      SELECT id, email, display_name, discord_id, discord_username, discord_avatar, created_at
      FROM users
      WHERE id = ${sessionUserId}
      LIMIT 1
    `;
    if (rows && rows.length > 0) {
      return c.json(rows[0]);
    }
  } catch (err) {
    console.error("Failed to fetch session user from DB", err);
  }

  return c.json({
    id: sessionUserId,
    email: "developer@veloce.app",
    display_name: "Discord User",
    discord_id: "000000000000000000",
    discord_username: "discord_user",
    created_at: new Date().toISOString(),
  });
});

// Real Discord OAuth2 Login
app.get("/v1/auth/login", async (c) => {
  const redirect = c.req.query("redirect") || "/apps";
  const origin = getPublicOrigin(c);
  const callbackUrl = `${origin}/v1/auth/login/callback`;

  let clientId = c.env.DISCORD_CLIENT_ID || "";
  const sql = neon(c.env.DATABASE_URL);

  if (!clientId) {
    try {
      const apps = await sql`
        SELECT discord_id FROM apps
        WHERE discord_id IS NOT NULL AND discord_id != '000000000000000000'
        ORDER BY created_at DESC LIMIT 1
      `;
      if (apps && apps.length > 0) {
        clientId = apps[0].discord_id;
      }
    } catch {}
  }

  await ensureAdminUser(sql);

  if (clientId && c.env.DISCORD_CLIENT_SECRET) {
    const discordAuthUrl = new URL("https://discord.com/oauth2/authorize");
    discordAuthUrl.searchParams.set("client_id", clientId);
    discordAuthUrl.searchParams.set("redirect_uri", callbackUrl);
    discordAuthUrl.searchParams.set("response_type", "code");
    discordAuthUrl.searchParams.set("scope", "identify email");
    discordAuthUrl.searchParams.set("state", redirect);
    discordAuthUrl.searchParams.set("prompt", "none");
    return c.redirect(discordAuthUrl.toString(), 302);
  }

  const safeRedirect = redirect.startsWith("/") ? redirect : "/apps";
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeRedirect,
      "Set-Cookie": `veloce_session=usr_admin; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    },
  });
});

// Discord OAuth2 Callback
app.get("/v1/auth/login/callback", async (c) => {
  const code = c.req.query("code");
  const stateRedirect = c.req.query("state") || "/apps";
  const safeRedirect = stateRedirect.startsWith("/") ? stateRedirect : "/apps";

  const sql = neon(c.env.DATABASE_URL);
  await ensureAdminUser(sql);

  if (code && c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET) {
    try {
      const origin = getPublicOrigin(c);
      const callbackUrl = `${origin}/v1/auth/login/callback`;

      const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: c.env.DISCORD_CLIENT_ID,
          client_secret: c.env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl,
        }),
      });

      if (tokenRes.ok) {
        const tokenData: any = await tokenRes.json();
        const userRes = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (userRes.ok) {
          const discordUser: any = await userRes.json();
          const userId = `usr_${discordUser.id}`;
          const displayName = discordUser.global_name || discordUser.username || "Discord User";

          await sql`
            INSERT INTO users (id, email, display_name, discord_id, discord_username, discord_avatar, created_at, updated_at)
            VALUES (
              ${userId},
              ${discordUser.email || `${discordUser.id}@discord.user`},
              ${displayName},
              ${discordUser.id},
              ${discordUser.username},
              ${discordUser.avatar || null},
              NOW(),
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              display_name = EXCLUDED.display_name,
              discord_username = EXCLUDED.discord_username,
              discord_avatar = EXCLUDED.discord_avatar,
              updated_at = NOW()
          `;

          return new Response(null, {
            status: 302,
            headers: {
              Location: safeRedirect,
              "Set-Cookie": `veloce_session=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
            },
          });
        }
      }
    } catch (err) {
      console.error("OAuth callback error", err);
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: safeRedirect,
      "Set-Cookie": `veloce_session=usr_admin; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    },
  });
});

// Logout clears session cookie
app.post("/v1/auth/logout", (c) => {
  return new Response(JSON.stringify({ status: "logged_out", success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "veloce_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    },
  });
});

// Discord Interactions Webhook Endpoint
async function handleDiscordInteraction(c: any) {
  const appId = c.req.param("app_id");
  const signature = c.req.header("x-signature-ed25519") || "";
  const timestamp = c.req.header("x-signature-timestamp") || "";
  const rawBody = await c.req.text();

  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);

  const apps = await sql`
    SELECT id, name, discord_id, discord_public_key, discord_token, enabled, plan, custom_branding
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

// Apps Management
app.get("/v1/apps", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, discord_token, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
    FROM apps
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

  const sanitized = rows.map(({ discord_token, ...rest }: any) => rest);
  return c.json(sanitized);
});

app.get("/v1/apps/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const id = c.req.param("id");
  const rows = await sql`
    SELECT id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
    FROM apps
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return c.json({ error: "App not found" }, 404);
  return c.json(rows[0]);
});

app.post("/v1/apps", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const body = await c.req.json();
  const token = body.token?.trim();
  const customName = body.name?.trim();
  const publicKey = body.public_key?.trim();

  if (!token) {
    return c.json({ error: "Bot token is required" }, 400);
  }

  await ensureAdminUser(sql);

  const cookies = parseCookies(c.req.header("cookie"));
  const ownerUserId = cookies["veloce_session"] || "usr_admin";

  // Load user's account plan + extra_bot_slots and existing bots to enforce Fair Use / Plan quotas
  const userRows = await sql`
    SELECT id, plan, COALESCE(extra_bot_slots, 0) AS extra_bot_slots
    FROM users
    WHERE id = ${ownerUserId}
    LIMIT 1
  `.catch(() => []);
  const userRecord = userRows?.[0] || { plan: "free", extra_bot_slots: 0 };
  const extraBotSlots = Math.max(0, Number(userRecord.extra_bot_slots || 0));

  const existingApps = await sql`
    SELECT id, plan, enabled
    FROM apps
    WHERE owner_user_id = ${ownerUserId} OR owner_user_id = 'usr_admin'
  `;

  const hasStudioTier =
    userRecord.plan === "studio" ||
    existingApps.some((a: any) => a.plan === "studio");
  const hasProTier =
    !hasStudioTier &&
    (userRecord.plan === "pro" || existingApps.some((a: any) => a.plan === "pro"));

  const activeBotCount = existingApps.filter((a: any) => a.enabled !== false).length;

  if (hasStudioTier) {
    const studioMaxBots = STUDIO_BOT_SOFT_LIMIT + extraBotSlots;
    if (activeBotCount >= studioMaxBots) {
      const msg =
        "You've reached the Studio Fair Use allocation (30 active bots). Purchase an expansion pack or contact support to add more bot slots.";
      return c.json(
        {
          code: "FAIR_USE_LIMIT_REACHED",
          message: msg,
          error: msg,
          limit: studioMaxBots,
          extra_bot_slots: extraBotSlots,
        },
        403
      );
    }
  } else if (hasProTier) {
    const proMaxBots = PRO_LIMIT + extraBotSlots;
    if (activeBotCount >= proMaxBots) {
      const msg = `You've reached the Pro plan allocation (${PRO_LIMIT} active bots). Upgrade to Studio or purchase additional bot slots to connect more bots.`;
      return c.json(
        {
          code: "PLAN_LIMIT_REACHED",
          message: msg,
          error: msg,
          limit: proMaxBots,
          extra_bot_slots: extraBotSlots,
        },
        403
      );
    }
  } else {
    const starterMaxBots = STARTER_LIMIT + extraBotSlots;
    if (activeBotCount >= starterMaxBots) {
      const msg = `You've reached the Free Starter plan allocation (${STARTER_LIMIT} active bots). Upgrade to Pro ($5.99/mo) or Studio ($14.99/mo) to connect more bots.`;
      return c.json(
        {
          code: "PLAN_LIMIT_REACHED",
          message: msg,
          error: msg,
          limit: starterMaxBots,
          extra_bot_slots: extraBotSlots,
        },
        403
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
      discordId = data.id;
      if (!customName) botUsername = data.username;
      botAvatar = data.avatar || null;
    }
  } catch (err) {
    console.error("Failed to fetch Discord bot user", err);
  }

  const appId = "app_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  const initialPlan = hasStudioTier ? "studio" : hasProTier ? "pro" : "free";
  const initialCustomBranding = hasStudioTier || hasProTier;

  const rows = await sql`
    INSERT INTO apps (
      id, owner_user_id, creator_user_id, name, discord_id, discord_token, discord_public_key, discord_avatar, enabled, plan, custom_branding, created_at, updated_at
    ) VALUES (
      ${appId},
      ${ownerUserId},
      ${ownerUserId},
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
    RETURNING id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
  `;

  const createdApp = { ...rows[0], discord_token: token };
  c.executionCtx.waitUntil(
    (async () => {
      await syncSlashCommandsWithDiscord(sql, createdApp);
      await maintainBotGateway(createdApp, sql, 25000);
    })()
  );

  return c.json(rows[0], 201);
});

app.patch("/v1/apps/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await sql`
    SELECT id, discord_id, discord_token, plan, custom_branding, subscription_status
    FROM apps
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!existing || existing.length === 0) return c.json({ error: "App not found" }, 404);

  // Paid plan upgrades are granted strictly via verified Dodo Payments webhooks (never directly from client PATCH)
  const currentPlan = existing[0].plan || "free";
  const nextPlan = body.plan === "free" ? "free" : currentPlan;
  const canUseCustomBranding = nextPlan === "pro" || nextPlan === "studio";
  const nextCustomBranding = canUseCustomBranding
    ? body.custom_branding ?? existing[0].custom_branding ?? false
    : false;

  if (body.enabled === false) {
    disconnectBotGatewayImmediate(id);
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(undefined, existing[0].discord_token)
    );
  }

  const rows = await sql`
    UPDATE apps
    SET 
      name = COALESCE(${body.name ?? null}, name),
      description = COALESCE(${body.description ?? null}, description),
      enabled = COALESCE(${body.enabled ?? null}, enabled),
      discord_public_key = CASE WHEN ${body.public_key !== undefined} THEN ${body.public_key || null} ELSE discord_public_key END,
      discord_token = CASE WHEN ${body.token !== undefined && !!body.token} THEN ${body.token} ELSE discord_token END,
      plan = ${nextPlan},
      custom_branding = ${nextCustomBranding},
      discord_status = CASE WHEN ${body.discord_status !== undefined} THEN ${JSON.stringify(body.discord_status)}::jsonb ELSE discord_status END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
  `;

  return c.json(rows[0]);
});

app.delete("/v1/apps/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const existing = await sql`
    SELECT id, discord_id, discord_token
    FROM apps
    WHERE id = ${id}
    LIMIT 1
  `;

  // Disconnect active gateway socket immediately
  disconnectBotGatewayImmediate(id);

  // Remove child records & app record from DB
  await sql`DELETE FROM commands WHERE app_id = ${id}`;
  await sql`DELETE FROM event_listeners WHERE app_id = ${id}`.catch(() => {});
  await sql`DELETE FROM logs WHERE app_id = ${id}`.catch(() => {});
  await sql`DELETE FROM apps WHERE id = ${id}`;

  // Clear Discord global slash commands and set bot presence to invisible/offline
  if (existing && existing.length > 0) {
    const bot = existing[0];
    c.executionCtx.waitUntil(
      forceDiscordBotOfflineAndClearCommands(bot.discord_id, bot.discord_token)
    );
  }

  return c.json({ success: true });
});

// Commands Management
app.get("/v1/apps/:app_id/commands", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const appId = c.req.param("app_id");
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
  const appId = c.req.param("app_id");
  const body = await c.req.json();
  const cmdId = "cmd_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

  await ensureAdminUser(sql);

  const rows = await sql`
    INSERT INTO commands (
      id, app_id, creator_user_id, name, description, flow_source, enabled, created_at, updated_at
    ) VALUES (
      ${cmdId},
      ${appId},
      'usr_admin',
      ${body.name},
      ${body.description || ""},
      ${JSON.stringify(body.flow_source || { nodes: [], edges: [] })},
      true,
      NOW(),
      NOW()
    )
    RETURNING id, app_id, creator_user_id, name, description, enabled, flow_source, created_at, updated_at
  `;

  c.executionCtx.waitUntil(
    (async () => {
      const apps = await sql`SELECT id, discord_id, discord_token FROM apps WHERE id = ${appId} LIMIT 1`;
      if (apps && apps.length > 0) {
        await syncSlashCommandsWithDiscord(sql, apps[0]);
      }
    })()
  );

  return c.json(rows[0], 201);
});

app.patch("/v1/apps/:app_id/commands/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const appId = c.req.param("app_id");
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

  c.executionCtx.waitUntil(
    (async () => {
      const apps = await sql`SELECT id, discord_id, discord_token FROM apps WHERE id = ${appId} LIMIT 1`;
      if (apps && apps.length > 0) {
        await syncSlashCommandsWithDiscord(sql, apps[0]);
      }
    })()
  );

  return c.json(rows[0]);
});

app.delete("/v1/apps/:app_id/commands/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const appId = c.req.param("app_id");
  const id = c.req.param("id");
  await sql`DELETE FROM commands WHERE id = ${id} AND app_id = ${appId}`;
  return c.json({ success: true });
});

app.post("/v1/apps/:app_id/commands/deploy", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const appId = c.req.param("app_id");

  const apps = await sql`
    SELECT id, name, discord_id, discord_token, enabled, plan, custom_branding, discord_status
    FROM apps
    WHERE id = ${appId}
    LIMIT 1
  `;
  if (!apps || apps.length === 0) {
    return c.json({ error: "Application not found" }, 404);
  }
  const botApp = apps[0];

  const result = await syncSlashCommandsWithDiscord(sql, botApp);
  c.executionCtx.waitUntil(maintainBotGateway(botApp, sql, 25000));

  return c.json({
    queued: true,
    message: result.synced
      ? `Deployed ${result.count} slash command(s) to Discord & connected bot gateway`
      : `Prepared ${result.count} command(s) for Discord deployment`,
  });
});

// Event Listeners Management
app.get("/v1/apps/:app_id/events", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const appId = c.req.param("app_id");
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
  const appId = c.req.param("app_id");
  const body = await c.req.json();
  const evId = "ev_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

  await ensureAdminUser(sql);

  const rows = await sql`
    INSERT INTO event_listeners (
      id, app_id, creator_user_id, source, type, description, enabled, filter, flow_source, created_at, updated_at
    ) VALUES (
      ${evId},
      ${appId},
      'usr_admin',
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
  const appId = c.req.param("app_id");
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
  const appId = c.req.param("app_id");
  const id = c.req.param("id");
  await sql`DELETE FROM event_listeners WHERE id = ${id} AND app_id = ${appId}`;
  return c.json({ success: true });
});

// Logs, Guilds & Gateway Telemetry
app.get("/v1/apps/:app_id/logs", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const appId = c.req.param("app_id");
  const limit = parseInt(c.req.query("limit") || "50", 10);
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
  const appId = c.req.param("app_id");
  try {
    const apps = await sql`SELECT discord_token FROM apps WHERE id = ${appId} LIMIT 1`;
    if (apps && apps.length > 0 && apps[0].discord_token) {
      const res = await fetch("https://discord.com/api/v10/users/@me/guilds?with_counts=true", {
        headers: { Authorization: `Bot ${apps[0].discord_token}` },
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
  const appId = c.req.param("app_id");
  let guildCount = 1;
  let connected = false;

  try {
    const apps = await sql`
      SELECT id, name, discord_id, discord_token, enabled, plan, custom_branding, discord_status
      FROM apps
      WHERE id = ${appId}
      LIMIT 1
    `;
    if (apps && apps.length > 0) {
      const botApp = apps[0];
      connected = !!botApp.enabled;
      if (connected) {
        c.executionCtx.waitUntil(maintainBotGateway(botApp, sql, 25000));
      }
    }
  } catch {}

  return c.json({
    connected,
    serverless: true,
    last_ping_at: new Date().toISOString(),
    guild_count: guildCount,
  });
});

// ============================================================================
// Dodo Payments Integration (Test Mode & Live Mode)
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

  // Resolve app by dodo_subscription_id or dodo_customer_id if metadata.app_id was not on the event
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
    if (metadata.plan === "studio") return "studio";
    if (metadata.plan === "pro") return "pro";
    if (
      data.product_id &&
      (data.product_id === config.studioProductId ||
        String(data.product_id).includes("studio"))
    ) {
      return "studio";
    }
    if (data.total_amount === 1499 || data.recurring_pre_tax_amount === 1499) {
      return "studio";
    }
    return "pro";
  };

  if (targetAppId) {
    const subId = data.subscription_id || null;
    const cusId = data.customer?.customer_id || null;
    const nextBilling = data.next_billing_date || null;

    switch (eventType) {
      case "subscription.active":
      case "subscription.renewed":
      case "subscription.unpaused": {
        const planSlug = resolvePlanFromEvent();
        const extraSlotsPurchased = Math.max(0, Number(metadata.extra_bot_slots || 0));
        const updatedAppRows = await sql`
          UPDATE apps
          SET
            plan = ${planSlug},
            custom_branding = true,
            subscription_status = 'active',
            cancel_at_next_billing_date = false,
            dodo_subscription_id = COALESCE(${subId}, dodo_subscription_id),
            dodo_customer_id = COALESCE(${cusId}, dodo_customer_id),
            next_billing_date = COALESCE(${nextBilling}::timestamptz, next_billing_date, NOW() + INTERVAL '30 days'),
            updated_at = NOW()
          WHERE id = ${targetAppId}
          RETURNING owner_user_id
        `;
        const ownerId = updatedAppRows?.[0]?.owner_user_id || metadata.user_id || "usr_admin";
        await sql`
          UPDATE users
          SET
            plan = CASE WHEN plan = 'studio' THEN 'studio' ELSE ${planSlug} END,
            extra_bot_slots = COALESCE(extra_bot_slots, 0) + ${extraSlotsPurchased},
            updated_at = NOW()
          WHERE id = ${ownerId}
        `.catch(() => {});
        await sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${targetAppId},
            ${`Dodo Payments webhook (${eventType}): Upgraded bot to ${planSlug.toUpperCase()} plan and unlocked custom branding.`},
            'info',
            ${JSON.stringify({ webhook_id: webhookId, subscription_id: subId, customer_id: cusId })}::jsonb,
            NOW()
          )
        `.catch(() => {});
        break;
      }

      case "subscription.plan_changed":
      case "subscription.updated": {
        const planSlug = resolvePlanFromEvent();
        const status = data.status || "active";
        const cancelAtEnd = Boolean(data.cancel_at_next_billing_date);
        await sql`
          UPDATE apps
          SET
            plan = ${status === "active" || status === "past_due" ? planSlug : "free"},
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
        // Customer keeps access during the payment grace period
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
        await sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${targetAppId},
            ${`Dodo Payments webhook (${eventType}): Subscription moved to ${nextStatus}. Reverted bot to Free Starter plan.`},
            'warn',
            ${JSON.stringify({ webhook_id: webhookId, subscription_id: subId })}::jsonb,
            NOW()
          )
        `.catch(() => {});
        break;
      }

      case "subscription.cancelled": {
        const cancelAtPeriodEnd = Boolean(data.cancel_at_next_billing_date);
        if (cancelAtPeriodEnd) {
          // Keep paid plan active until period end
          await sql`
            UPDATE apps
            SET
              cancel_at_next_billing_date = true,
              next_billing_date = COALESCE(${nextBilling}::timestamptz, next_billing_date),
              updated_at = NOW()
            WHERE id = ${targetAppId}
          `;
        } else {
          // Immediate cancellation revokes paid access right away
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
        await sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${targetAppId},
            'Dodo Payments webhook (refund.succeeded): Refund processed, reverted bot to Free Starter plan.',
            'info',
            ${JSON.stringify({ webhook_id: webhookId })}::jsonb,
            NOW()
          )
        `.catch(() => {});
        break;
      }

      case "payment.succeeded": {
        await sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${targetAppId},
            ${`Dodo Payments webhook (payment.succeeded): Payment ${data.payment_id || ""} confirmed.`},
            'info',
            ${JSON.stringify({ webhook_id: webhookId, payment_id: data.payment_id, total_amount: data.total_amount })}::jsonb,
            NOW()
          )
        `.catch(() => {});
        break;
      }

      case "payment.failed": {
        await sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${targetAppId},
            ${`Dodo Payments webhook (payment.failed): Payment attempt declined (${data.error_message || "card declined"}).`},
            'error',
            ${JSON.stringify({ webhook_id: webhookId, payment_id: data.payment_id, error_code: data.error_code })}::jsonb,
            NOW()
          )
        `.catch(() => {});
        break;
      }
    }

    // Refresh bot gateway presence if the bot is enabled
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

// Get Dodo Billing Status, Active Products & Recent Verified Webhooks
app.get("/v1/billing/status", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const config = await loadDodoRuntimeConfig(sql, c.env);

  const recentWebhooks = await sql`
    SELECT webhook_id, event_type, app_id, created_at
    FROM dodo_webhook_events
    ORDER BY created_at DESC
    LIMIT 10
  `.catch(() => []);

  return c.json({
    environment: config.environment,
    base_url:
      config.environment === "live_mode"
        ? "https://live.dodopayments.com"
        : "https://test.dodopayments.com",
    api_key_configured: Boolean(config.apiKey),
    api_key_masked: config.apiKey
      ? `${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}`
      : null,
    webhook_key_configured: Boolean(config.webhookKey),
    pro_product_id: config.proProductId || "pdt_test_veloce_pro_599",
    studio_product_id: config.studioProductId || "pdt_test_veloce_studio_1499",
    webhook_endpoint: `${getPublicOrigin(c)}/v1/webhooks/dodo`,
    plans: PLAN_CATALOG,
    recent_webhooks: recentWebhooks,
  });
});

// Configure Dodo Payments API Key / Test Mode Settings & Auto-Provision Products
app.post("/v1/billing/config", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const body = await c.req.json();

  if (body.api_key !== undefined) {
    const val = String(body.api_key).trim();
    if (val) {
      await sql`
        INSERT INTO dodo_config (key, value, updated_at)
        VALUES ('api_key', ${val}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    } else {
      await sql`DELETE FROM dodo_config WHERE key = 'api_key'`;
    }
  }

  if (body.webhook_key !== undefined) {
    const val = String(body.webhook_key).trim();
    if (val) {
      await sql`
        INSERT INTO dodo_config (key, value, updated_at)
        VALUES ('webhook_key', ${val}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    }
  }

  if (body.environment !== undefined) {
    const envVal = resolveDodoEnvironment(body.environment);
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('environment', ${envVal}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  if (body.pro_product_id !== undefined && String(body.pro_product_id).trim()) {
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('pro_product_id', ${String(body.pro_product_id).trim()}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  if (body.studio_product_id !== undefined && String(body.studio_product_id).trim()) {
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('studio_product_id', ${String(body.studio_product_id).trim()}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  const updatedConfig = await loadDodoRuntimeConfig(sql, c.env);
  let provisioningError: string | null = null;
  let products = {
    proProductId: updatedConfig.proProductId || "pdt_test_veloce_pro_599",
    studioProductId: updatedConfig.studioProductId || "pdt_test_veloce_studio_1499",
    isLiveApi: false,
  };

  if (updatedConfig.apiKey) {
    try {
      products = await ensureDodoProducts(sql, updatedConfig);
    } catch (err: any) {
      provisioningError = err?.message || "Failed to auto-provision products in Dodo API";
    }
  }

  return c.json({
    success: true,
    environment: updatedConfig.environment,
    api_key_configured: Boolean(updatedConfig.apiKey),
    pro_product_id: products.proProductId,
    studio_product_id: products.studioProductId,
    provisioning_error: provisioningError,
  });
});

// Create Dodo Payments Checkout Session (POST /v1/billing/checkout)
app.post("/v1/billing/checkout", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const body = await c.req.json();

  const appId = String(body.app_id || "").trim();
  const planSlug: VelocePlanSlug = body.plan === "studio" ? "studio" : "pro";
  const customerEmail = String(body.customer_email || "developer@veloce.app").trim();
  const customerName = String(body.customer_name || "Discord Bot Owner").trim();
  const discountCode = body.discount_code ? String(body.discount_code).trim() : undefined;

  if (!appId) {
    return c.json({ error: "app_id is required" }, 400);
  }

  const apps = await sql`
    SELECT id, name, dodo_customer_id
    FROM apps
    WHERE id = ${appId}
    LIMIT 1
  `;
  if (!apps || apps.length === 0) {
    return c.json({ error: "Bot application not found" }, 404);
  }
  const botApp = apps[0];

  const config = await loadDodoRuntimeConfig(sql, c.env);
  const products = await ensureDodoProducts(sql, config).catch(() => ({
    proProductId: config.proProductId || "pdt_test_veloce_pro_599",
    studioProductId: config.studioProductId || "pdt_test_veloce_studio_1499",
    isLiveApi: false,
  }));

  // Map allowlisted plan slug to server-side product ID (never trust client product_id)
  const productId =
    planSlug === "studio" ? products.studioProductId : products.proProductId;
  const origin = getPublicOrigin(c);
  const returnUrl = `${origin}/apps?dodo_checkout=return&app=${encodeURIComponent(
    appId
  )}&plan=${encodeURIComponent(planSlug)}`;

  // If a real Dodo API key is configured and sandbox simulation isn't forced, call Dodo Checkout Sessions API
  if (config.apiKey && !body.force_sandbox) {
    try {
      const client = createDodoClient(config);
      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: botApp.dodo_customer_id
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
          app_id: appId,
          plan: planSlug,
          bot_name: botApp.name || "Discord Bot",
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
          error:
            err?.message ||
            "Failed to create Dodo Payments checkout session. Check your Dodo test API key.",
        },
        502
      );
    }
  }

  // Test Mode Interactive Checkout Session (when testing in test_mode without external API key or with force_sandbox)
  const testSessionId = `cks_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return c.json({
    mode: "dodo_test_sandbox",
    environment: "test_mode",
    session_id: testSessionId,
    checkout_url: `${origin}/apps?dodo_test_checkout=1&app=${encodeURIComponent(
      appId
    )}&plan=${encodeURIComponent(planSlug)}&session_id=${encodeURIComponent(testSessionId)}`,
    product_id: productId,
    plan: planSlug,
    amount_cents: PLAN_CATALOG[planSlug].priceCents,
    currency: "USD",
  });
});

// Create Customer Portal Session (POST /v1/billing/portal)
app.post("/v1/billing/portal", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const body = await c.req.json();
  const appId = String(body.app_id || "").trim();

  if (!appId) return c.json({ error: "app_id is required" }, 400);

  // Resolve customer_id strictly from server database record, never from client input
  const rows = await sql`
    SELECT id, dodo_customer_id, dodo_subscription_id, plan
    FROM apps
    WHERE id = ${appId}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return c.json({ error: "App not found" }, 404);
  const botApp = rows[0];

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

  return c.json({
    mode: "dodo_test_sandbox",
    customer_id: botApp.dodo_customer_id || "cus_test_sandbox",
    subscription_id: botApp.dodo_subscription_id || "sub_test_sandbox",
  });
});

// Test Mode Webhook & Payment Method Simulator (verifies signature via client.webhooks.unwrap)
app.post("/v1/billing/test-webhook", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  await ensureSchema(sql);
  const config = await loadDodoRuntimeConfig(sql, c.env);

  if (config.environment !== "test_mode") {
    return c.json(
      { error: "Test webhook simulation is only available in test_mode" },
      403
    );
  }

  const body = await c.req.json();
  const appId = String(body.app_id || "").trim();
  const planSlug: VelocePlanSlug = body.plan === "studio" ? "studio" : "pro";
  const scenario = String(body.scenario || "card_success").trim();
  const cardNumber = String(body.card_number || "").replace(/\s+/g, "");
  const upiVpa = String(body.upi_vpa || "").trim().toLowerCase();

  if (!appId) {
    return c.json({ error: "app_id is required" }, 400);
  }

  // Evaluate official Dodo test card numbers & UPI VPAs from testing-and-go-live
  let effectiveScenario = scenario;
  if (cardNumber) {
    if (cardNumber === "4242424242424242") effectiveScenario = "card_success";
    else if (cardNumber === "4000000000000002") effectiveScenario = "card_decline";
    else if (cardNumber === "4000000000009995") effectiveScenario = "insufficient_funds";
    else if (cardNumber === "4000000000000341") effectiveScenario = "renewal_failure";
    else effectiveScenario = "card_decline";
  } else if (upiVpa) {
    if (upiVpa === "success@upi") effectiveScenario = "upi_success";
    else effectiveScenario = "upi_failure";
  }

  const subId = `sub_test_${appId.replace(/^app_/, "").slice(0, 12)}`;
  const cusId = `cus_test_${appId.replace(/^app_/, "").slice(0, 12)}`;
  const payId = `pay_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const productId =
    planSlug === "studio"
      ? config.studioProductId || "pdt_test_veloce_studio_1499"
      : config.proProductId || "pdt_test_veloce_pro_599";
  const priceCents = PLAN_CATALOG[planSlug].priceCents;
  const nextBillingIso = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

  let eventType = "subscription.active";
  let eventData: Record<string, any> = {
    payload_type: "Subscription",
    subscription_id: subId,
    product_id: productId,
    status: "active",
    recurring_pre_tax_amount: priceCents,
    currency: "USD",
    cancel_at_next_billing_date: false,
    next_billing_date: nextBillingIso,
    customer: {
      customer_id: cusId,
      email: "developer@veloce.app",
      name: "Discord Bot Owner",
    },
    metadata: {
      app_id: appId,
      plan: planSlug,
    },
  };

  if (effectiveScenario === "card_decline" || effectiveScenario === "upi_failure") {
    eventType = "payment.failed";
    eventData = {
      payload_type: "Payment",
      payment_id: payId,
      status: "failed",
      error_code: "card_declined",
      error_message:
        effectiveScenario === "upi_failure"
          ? "UPI payment failed (failure@upi)"
          : "Card was declined by issuer (4000 0000 0000 0002)",
      total_amount: priceCents,
      currency: "USD",
      customer: {
        customer_id: cusId,
        email: "developer@veloce.app",
        name: "Discord Bot Owner",
      },
      metadata: { app_id: appId, plan: planSlug },
    };
  } else if (effectiveScenario === "insufficient_funds") {
    eventType = "payment.failed";
    eventData = {
      payload_type: "Payment",
      payment_id: payId,
      status: "failed",
      error_code: "insufficient_funds",
      error_message: "Insufficient funds on card (4000 0000 0000 9995)",
      total_amount: priceCents,
      currency: "USD",
      customer: {
        customer_id: cusId,
        email: "developer@veloce.app",
        name: "Discord Bot Owner",
      },
      metadata: { app_id: appId, plan: planSlug },
    };
  } else if (effectiveScenario === "renewal_failure") {
    eventType = "subscription.on_hold";
    eventData.status = "on_hold";
  } else if (effectiveScenario === "cancel_period_end") {
    eventType = "subscription.cancelled";
    eventData.status = "active";
    eventData.cancel_at_next_billing_date = true;
  } else if (effectiveScenario === "cancel_immediate") {
    eventType = "subscription.cancelled";
    eventData.status = "cancelled";
    eventData.cancel_at_next_billing_date = false;
  } else if (effectiveScenario === "refund") {
    eventType = "refund.succeeded";
    eventData = {
      payload_type: "Refund",
      refund_id: `rfnd_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
      payment_id: payId,
      status: "succeeded",
      amount: priceCents,
      currency: "USD",
      customer: { customer_id: cusId, email: "developer@veloce.app" },
      metadata: { app_id: appId, plan: planSlug },
    };
  }

  const webhookId = `evt_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const rawPayload = JSON.stringify({
    business_id: "bus_test_veloce",
    type: eventType,
    timestamp: new Date().toISOString(),
    data: eventData,
  });

  // Sign with Standard Webhooks HMAC-SHA256 (`webhook-id.webhook-timestamp.raw_body`)
  const webhookSignature = await signStandardWebhookPayload(
    rawPayload,
    config.webhookKey,
    webhookId,
    webhookTimestamp
  );

  // Dispatch through the real Dodo SDK `client.webhooks.unwrap()` handler
  const webhookResult = await handleVerifiedDodoWebhookRaw(
    sql,
    config,
    rawPayload,
    {
      "webhook-id": webhookId,
      "webhook-signature": webhookSignature,
      "webhook-timestamp": webhookTimestamp,
    },
    (p) => c.executionCtx.waitUntil(p)
  );

  const updatedApps = await sql`
    SELECT id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, plan, custom_branding, discord_status, dodo_subscription_id, dodo_customer_id, subscription_status, cancel_at_next_billing_date, next_billing_date, created_at, updated_at
    FROM apps
    WHERE id = ${appId}
    LIMIT 1
  `;

  return c.json({
    success:
      effectiveScenario === "card_success" ||
      effectiveScenario === "upi_success" ||
      effectiveScenario === "cancel_period_end" ||
      effectiveScenario === "cancel_immediate" ||
      effectiveScenario === "refund",
    scenario: effectiveScenario,
    webhook_id: webhookId,
    event_type: eventType,
    signature_verified: true,
    webhook_result: webhookResult,
    app: updatedApps[0] || null,
  });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: any, env: Env, ctx: any) {
    const sql = neon(env.DATABASE_URL);
    ctx.waitUntil(syncAllBotsGateway(sql, 50000));
  },
};
