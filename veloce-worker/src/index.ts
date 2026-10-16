import { Hono } from "hono";
import { cors } from "hono/cors";
import { neon } from "@neondatabase/serverless";
import { verifyDiscordSignature } from "./crypto";
import { executeFlow, InteractionPayload } from "./flow";

export interface Env {
  DATABASE_URL: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for web dashboard
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return "*";
    if (origin.includes("veloce-app.pages.dev") || origin.includes("localhost") || origin.includes("workers.dev")) {
      return origin;
    }
    return "*";
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Signature-Ed25519", "X-Signature-Timestamp"],
  credentials: true,
}));

async function ensureAdminUser(sql: any) {
  try {
    await sql`
      INSERT INTO users (id, email, display_name, discord_id, discord_username, created_at, updated_at)
      VALUES ('usr_admin', 'admin@veloce.app', 'Veloce Admin', '000000000000000000', 'admin', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    console.error("ensureAdminUser error", err);
  }
}

// Root and Health
app.get("/", (c) => c.json({
  service: "veloce-api",
  runtime: "cloudflare-workers",
  status: "ok",
  version: "0.1.0",
  timestamp: new Date().toISOString(),
}));

app.get("/v1/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Current user profile
app.get("/v1/user/@me", (c) => {
  return c.json({
    id: "usr_admin",
    email: "admin@veloce.app",
    display_name: "Veloce Admin",
    discord_id: "000000000000000000",
    discord_username: "admin",
    created_at: new Date().toISOString(),
  });
});

app.get("/v1/auth/login", (c) => {
  const redirect = c.req.query("redirect") || "/apps";
  return c.redirect(redirect);
});

app.post("/v1/auth/logout", (c) => {
  return c.json({ status: "logged_out", success: true });
});

// Discord Interactions Webhook Endpoint
async function handleDiscordInteraction(c: any) {
  const appId = c.req.param("app_id");
  const signature = c.req.header("x-signature-ed25519") || "";
  const timestamp = c.req.header("x-signature-timestamp") || "";
  const rawBody = await c.req.text();

  const sql = neon(c.env.DATABASE_URL);

  // Look up app
  const apps = await sql`
    SELECT id, name, discord_id, discord_public_key, discord_token 
    FROM apps 
    WHERE id = ${appId} OR discord_id = ${appId}
    LIMIT 1
  `;

  if (!apps || apps.length === 0) {
    return c.text("Application not found", 404);
  }

  const botApp = apps[0];

  // If public key is set, verify cryptographic Ed25519 signature
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

  // Type 1: Discord PING Handshake
  if (payload.type === 1) {
    return c.json({ type: 1 });
  }

  // Type 2: Application Command (Slash Command)
  if (payload.type === 2) {
    const cmdName = payload.data?.name;
    if (!cmdName) {
      return c.json({
        type: 4,
        data: { content: "Unknown command invocation" },
      });
    }

    // Look up command flow in database
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

      const execution = executeFlow(flowSource, payload);

      // Audit log execution asynchronously in logs table
      c.executionCtx.waitUntil(
        sql`
          INSERT INTO logs (app_id, message, level, details, created_at)
          VALUES (
            ${botApp.id},
            ${`Slash command /${cmdName} executed via serverless HTTP webhook`},
            'info',
            ${JSON.stringify({ logs: execution.logs, user: payload.member?.user || payload.user })},
            NOW()
          )
        `.catch((err) => console.error("Failed to insert log", err))
      );

      return c.json(execution.response);
    }

    return c.json({
      type: 4,
      data: {
        content: `Executed /${cmdName} (No flow configured yet in Veloce).`,
        flags: 64,
      },
    });
  }

  // Type 3: Component interaction (Button / Select Menu)
  if (payload.type === 3) {
    return c.json({
      type: 4,
      data: { content: "Component interaction acknowledged", flags: 64 },
    });
  }

  return c.json({ type: 1 });
}

app.post("/v1/interactions/:app_id", handleDiscordInteraction);
app.post("/interactions/:app_id", handleDiscordInteraction);

// Apps Management
app.get("/v1/apps", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, created_at, updated_at
    FROM apps
    ORDER BY created_at DESC
  `;
  return c.json(rows);
});

app.get("/v1/apps/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = await sql`
    SELECT id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, created_at, updated_at
    FROM apps
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return c.json({ error: "App not found" }, 404);
  return c.json(rows[0]);
});

app.post("/v1/apps", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const body = await c.req.json();
  const token = body.token?.trim();
  const customName = body.name?.trim();
  const publicKey = body.public_key?.trim();

  if (!token) {
    return c.json({ error: "Bot token is required" }, 400);
  }

  await ensureAdminUser(sql);

  // Fetch bot info from Discord API
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

  // Generate random id
  const appId = "app_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

  const rows = await sql`
    INSERT INTO apps (
      id, owner_user_id, creator_user_id, name, discord_id, discord_token, discord_public_key, discord_avatar, enabled, created_at, updated_at
    ) VALUES (
      ${appId},
      'usr_admin',
      'usr_admin',
      ${botUsername},
      ${discordId},
      ${token},
      ${publicKey || null},
      ${botAvatar},
      true,
      NOW(),
      NOW()
    )
    RETURNING id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, created_at, updated_at
  `;

  return c.json(rows[0], 201);
});

app.patch("/v1/apps/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await sql`SELECT id FROM apps WHERE id = ${id} LIMIT 1`;
  if (!existing || existing.length === 0) return c.json({ error: "App not found" }, 404);

  const rows = await sql`
    UPDATE apps
    SET 
      name = COALESCE(${body.name ?? null}, name),
      description = COALESCE(${body.description ?? null}, description),
      enabled = COALESCE(${body.enabled ?? null}, enabled),
      discord_public_key = CASE WHEN ${body.public_key !== undefined} THEN ${body.public_key || null} ELSE discord_public_key END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, owner_user_id, name, description, enabled, discord_id, discord_public_key, discord_avatar, created_at, updated_at
  `;

  return c.json(rows[0]);
});

app.delete("/v1/apps/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const id = c.req.param("id");
  await sql`DELETE FROM apps WHERE id = ${id}`;
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
  return c.json(rows[0]);
});

app.delete("/v1/apps/:app_id/commands/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const appId = c.req.param("app_id");
  const id = c.req.param("id");
  await sql`DELETE FROM commands WHERE id = ${id} AND app_id = ${appId}`;
  return c.json({ success: true });
});

// Logs & Gateway Telemetry
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

app.get("/v1/apps/:app_id/gateway", (c) => {
  return c.json({
    connected: true,
    serverless: true,
    last_ping_at: new Date().toISOString(),
    guild_count: 1,
  });
});

export default app;
