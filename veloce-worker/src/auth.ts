export type StaffRole = "FOUNDER" | "ADMIN" | "MODERATOR" | "SUPPORT" | "USER";

export const DEFAULT_FOUNDER_DISCORD_ID = "1294554358905831459";

export const ROLE_RANK: Record<StaffRole, number> = {
  USER: 1,
  SUPPORT: 2,
  MODERATOR: 3,
  ADMIN: 4,
  FOUNDER: 5,
};

export interface SessionJwtPayload {
  sub: string; // Discord snowflake ID
  discord_id: string;
  user_id: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  display_name: string;
  email: string;
  role: StaffRole;
  plan: "free" | "pro" | "studio";
  extra_bot_slots: number;
  is_banned: boolean;
  created_at: string;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

function base64UrlDecodeBytes(base64Url: string): Uint8Array {
  const padded = base64Url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeString(base64Url: string): string {
  return new TextDecoder().decode(base64UrlDecodeBytes(base64Url));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Resolves the cryptographic SESSION_SECRET strictly from `env.SESSION_SECRET`.
 * If `env.SESSION_SECRET` is not yet configured in the Worker bindings, falls back to a
 * 256-bit random key generated via Web Crypto and persisted only in the private database.
 */
export async function resolveSessionSecret(
  sql: any,
  env: { SESSION_SECRET?: string }
): Promise<string> {
  if (env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 16) {
    return env.SESSION_SECRET.trim();
  }

  const rows = await sql`
    SELECT value FROM dodo_config WHERE key = 'internal_session_secret' LIMIT 1
  `.catch(() => []);

  if (rows && rows.length > 0 && rows[0].value) {
    return rows[0].value;
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const generated = base64UrlEncodeBytes(randomBytes);
  await sql`
    INSERT INTO dodo_config (key, value, updated_at)
    VALUES ('internal_session_secret', ${generated}, NOW())
    ON CONFLICT (key) DO NOTHING
  `.catch(() => {});

  const recheck = await sql`
    SELECT value FROM dodo_config WHERE key = 'internal_session_secret' LIMIT 1
  `.catch(() => []);

  return recheck?.[0]?.value || generated;
}

/**
 * Resolves Discord OAuth2 credentials from Cloudflare environment bindings (`env.*`),
 * with fallback to encrypted database configuration if set.
 */
export async function resolveDiscordOAuthCredentials(
  sql: any,
  env: { DISCORD_CLIENT_ID?: string; DISCORD_CLIENT_SECRET?: string }
): Promise<{ clientId: string | null; clientSecret: string | null }> {
  let clientId = env.DISCORD_CLIENT_ID?.trim() || null;
  let clientSecret = env.DISCORD_CLIENT_SECRET?.trim() || null;

  if (!clientId || !clientSecret) {
    const rows = await sql`
      SELECT key, value FROM dodo_config
      WHERE key IN ('discord_client_id', 'discord_client_secret')
    `.catch(() => []);
    for (const r of rows || []) {
      if (r.key === "discord_client_id" && !clientId) clientId = r.value;
      if (r.key === "discord_client_secret" && !clientSecret) clientSecret = r.value;
    }
  }

  return { clientId, clientSecret };
}

/**
 * Signs a zero-trust HMAC-SHA256 JWT containing the verified Discord snowflake ID.
 */
export async function signSessionToken(
  discordId: string,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadObj: SessionJwtPayload = {
    sub: discordId,
    discord_id: discordId,
    user_id: `usr_${discordId}`,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
  };
  const payload = base64UrlEncodeString(JSON.stringify(payloadObj));
  const signingInput = `${header}.${payload}`;
  const key = await importHmacKey(secret);
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );
  const signature = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
  return `${signingInput}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 JWT in constant time using Web Crypto `crypto.subtle.verify`.
 * Rejects any unsigned, expired, or tampered token.
 */
export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionJwtPayload | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  try {
    const key = await importHmacKey(secret);
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlDecodeBytes(signatureB64);

    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, signingInput);
    if (!isValid) return null;

    const payloadRaw = base64UrlDecodeString(payloadB64);
    const payload = JSON.parse(payloadRaw) as SessionJwtPayload;

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) return null;
    if (!payload.discord_id || !/^\d{17,20}$/.test(String(payload.discord_id))) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Creates a cryptographically signed OAuth2 `state` token to prevent CSRF attacks.
 */
export async function createSignedOAuthState(
  redirectPath: string,
  secret: string
): Promise<{ state: string; nonce: string }> {
  const nonce = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes
  const safeRedirect = redirectPath.startsWith("/") ? redirectPath : "/apps";
  const data = JSON.stringify({ nonce, exp, redirect: safeRedirect });
  const encodedData = base64UrlEncodeString(data);
  const key = await importHmacKey(secret);
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedData)
  );
  const sig = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
  return {
    state: `${encodedData}.${sig}`,
    nonce,
  };
}

/**
 * Verifies the OAuth2 `state` parameter against both its HMAC-SHA256 signature and the
 * `HttpOnly` cookie nonce.
 */
export async function verifySignedOAuthState(
  stateParam: string,
  cookieState: string | undefined,
  secret: string
): Promise<{ redirect: string } | null> {
  if (!stateParam || !cookieState) return null;
  if (stateParam !== cookieState) return null;

  const parts = stateParam.split(".");
  if (parts.length !== 2) return null;
  const [encodedData, sigB64] = parts;

  try {
    const key = await importHmacKey(secret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecodeBytes(sigB64),
      new TextEncoder().encode(encodedData)
    );
    if (!isValid) return null;

    const parsed = JSON.parse(base64UrlDecodeString(encodedData));
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.exp || parsed.exp < now) return null;

    const safeRedirect =
      typeof parsed.redirect === "string" && parsed.redirect.startsWith("/")
        ? parsed.redirect
        : "/apps";
    return { redirect: safeRedirect };
  } catch {
    return null;
  }
}

/**
 * Masks a Discord Bot Token for safe display (e.g. `MTI0...x89a`), never exposing raw secret material.
 */
export function maskBotToken(token?: string | null): string | null {
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  if (trimmed.length <= 10) return "****";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function normalizeStaffRole(raw?: string | null): StaffRole {
  switch (String(raw || "").toUpperCase()) {
    case "FOUNDER":
      return "FOUNDER";
    case "ADMIN":
      return "ADMIN";
    case "MODERATOR":
      return "MODERATOR";
    case "SUPPORT":
      return "SUPPORT";
    default:
      return "USER";
  }
}

export function hasRequiredRole(userRole: StaffRole, minimumRole: StaffRole): boolean {
  return (ROLE_RANK[userRole] || 1) >= (ROLE_RANK[minimumRole] || 1);
}
