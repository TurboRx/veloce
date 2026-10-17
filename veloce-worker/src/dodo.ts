import DodoPayments from "dodopayments";

export type DodoEnvironment = "test_mode" | "live_mode";
export type VelocePlanSlug = "pro" | "studio" | "extra_slots_10";

export const PLAN_CATALOG: Record<
  VelocePlanSlug,
  {
    name: string;
    description: string;
    priceCents: number;
    currency: "USD";
    taxCategory: "saas";
  }
> = {
  pro: {
    name: "Veloce Pro Plan",
    description:
      "Pro Discord Bot Hosting ($5.99/month) — Unlocks custom branding, custom bot status & presence, and up to 10 bots.",
    priceCents: 599,
    currency: "USD",
    taxCategory: "saas",
  },
  studio: {
    name: "Veloce Studio Plan",
    description:
      "Studio Discord Bot Hosting ($14.99/month) — Full white-label bots, priority gateway workers, and Studio capacity.",
    priceCents: 1499,
    currency: "USD",
    taxCategory: "saas",
  },
  extra_slots_10: {
    name: "Veloce +10 Extra Bot Slots Expansion Pack",
    description:
      "Bot Capacity Expansion Pack ($4.99/month) — Adds +10 extra active Discord bot slots to your account.",
    priceCents: 499,
    currency: "USD",
    taxCategory: "saas",
  },
};

/**
 * Narrow environment string to Dodo's literal union.
 * Always defaults to "test_mode" so a missing or misspelled variable never hits live mode.
 */
export function resolveDodoEnvironment(raw?: string | null): DodoEnvironment {
  return raw === "live_mode" ? "live_mode" : "test_mode";
}

export interface DodoRuntimeConfig {
  apiKey: string | null;
  webhookKey: string;
  environment: DodoEnvironment;
  proProductId: string | null;
  studioProductId: string | null;
  extraSlotsProductId: string | null;
}

export async function loadDodoRuntimeConfig(
  sql: any,
  env: {
    DODO_PAYMENTS_API_KEY?: string;
    DODO_PAYMENTS_WEBHOOK_KEY?: string;
    DODO_PAYMENTS_ENVIRONMENT?: string;
    DODO_PRODUCT_PRO_ID?: string;
    DODO_PRODUCT_STUDIO_ID?: string;
    DODO_PRODUCT_EXTRA_SLOTS_ID?: string;
  }
): Promise<DodoRuntimeConfig> {
  const rows = await sql`SELECT key, value FROM dodo_config`.catch(() => []);
  const dbMap: Record<string, string> = {};
  for (const r of rows) {
    if (r.key && r.value) dbMap[r.key] = r.value;
  }

  const apiKey = env.DODO_PAYMENTS_API_KEY || dbMap.api_key || null;
  let webhookKey = env.DODO_PAYMENTS_WEBHOOK_KEY || dbMap.webhook_key || "";
  if (!webhookKey) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(24));
    webhookKey = btoa(String.fromCharCode(...randomBytes));
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('webhook_key', ${webhookKey}, NOW())
      ON CONFLICT (key) DO NOTHING
    `.catch(() => {});
  }
  const environment = resolveDodoEnvironment(
    env.DODO_PAYMENTS_ENVIRONMENT || dbMap.environment || "test_mode"
  );
  const proProductId = env.DODO_PRODUCT_PRO_ID || dbMap.pro_product_id || null;
  const studioProductId = env.DODO_PRODUCT_STUDIO_ID || dbMap.studio_product_id || null;
  const extraSlotsProductId =
    env.DODO_PRODUCT_EXTRA_SLOTS_ID || dbMap.extra_slots_product_id || null;

  return {
    apiKey,
    webhookKey,
    environment,
    proProductId,
    studioProductId,
    extraSlotsProductId,
  };
}

export function createDodoClient(config: {
  apiKey?: string | null;
  webhookKey?: string | null;
  environment?: string | null;
}): DodoPayments {
  const environment = resolveDodoEnvironment(config.environment);
  return new DodoPayments({
    bearerToken: config.apiKey || "",
    webhookKey: config.webhookKey || null,
    environment,
  });
}

/**
 * Ensures Veloce Pro ($5.99/mo), Veloce Studio ($14.99/mo), and +10 Extra Bot Slots ($4.99/mo)
 * recurring SaaS products exist in the connected Dodo Payments account.
 */
export async function ensureDodoProducts(
  sql: any,
  config: DodoRuntimeConfig
): Promise<{
  proProductId: string;
  studioProductId: string;
  extraSlotsProductId: string;
  isLiveApi: boolean;
}> {
  if (!config.apiKey) {
    return {
      proProductId: config.proProductId || "",
      studioProductId: config.studioProductId || "",
      extraSlotsProductId: config.extraSlotsProductId || "",
      isLiveApi: false,
    };
  }

  let proId = config.proProductId;
  let studioId = config.studioProductId;
  let extraSlotsId = config.extraSlotsProductId;

  if (proId && studioId && extraSlotsId) {
    return {
      proProductId: proId,
      studioProductId: studioId,
      extraSlotsProductId: extraSlotsId,
      isLiveApi: true,
    };
  }

  const client = createDodoClient(config);

  try {
    const existingList = await client.products.list({ page_size: 50 });
    for (const item of existingList.items || []) {
      if (!proId && item.name === PLAN_CATALOG.pro.name) {
        proId = item.product_id;
      }
      if (!studioId && item.name === PLAN_CATALOG.studio.name) {
        studioId = item.product_id;
      }
      if (!extraSlotsId && item.name === PLAN_CATALOG.extra_slots_10.name) {
        extraSlotsId = item.product_id;
      }
    }
  } catch (err) {
    console.warn("Could not list Dodo products, will attempt creation:", err);
  }

  if (!proId) {
    const createdPro = await client.products.create({
      name: PLAN_CATALOG.pro.name,
      description: PLAN_CATALOG.pro.description,
      tax_category: PLAN_CATALOG.pro.taxCategory,
      price: {
        type: "recurring_price",
        currency: PLAN_CATALOG.pro.currency,
        price: PLAN_CATALOG.pro.priceCents,
        discount: 0,
        payment_frequency_count: 1,
        payment_frequency_interval: "Month",
        subscription_period_count: 1,
        subscription_period_interval: "Month",
        purchasing_power_parity: false,
      },
    });
    proId = createdPro.product_id;
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('pro_product_id', ${proId}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  if (!studioId) {
    const createdStudio = await client.products.create({
      name: PLAN_CATALOG.studio.name,
      description: PLAN_CATALOG.studio.description,
      tax_category: PLAN_CATALOG.studio.taxCategory,
      price: {
        type: "recurring_price",
        currency: PLAN_CATALOG.studio.currency,
        price: PLAN_CATALOG.studio.priceCents,
        discount: 0,
        payment_frequency_count: 1,
        payment_frequency_interval: "Month",
        subscription_period_count: 1,
        subscription_period_interval: "Month",
        purchasing_power_parity: false,
      },
    });
    studioId = createdStudio.product_id;
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('studio_product_id', ${studioId}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  if (!extraSlotsId) {
    const createdExtra = await client.products.create({
      name: PLAN_CATALOG.extra_slots_10.name,
      description: PLAN_CATALOG.extra_slots_10.description,
      tax_category: PLAN_CATALOG.extra_slots_10.taxCategory,
      price: {
        type: "recurring_price",
        currency: PLAN_CATALOG.extra_slots_10.currency,
        price: PLAN_CATALOG.extra_slots_10.priceCents,
        discount: 0,
        payment_frequency_count: 1,
        payment_frequency_interval: "Month",
        subscription_period_count: 1,
        subscription_period_interval: "Month",
        purchasing_power_parity: false,
      },
    });
    extraSlotsId = createdExtra.product_id;
    await sql`
      INSERT INTO dodo_config (key, value, updated_at)
      VALUES ('extra_slots_product_id', ${extraSlotsId}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  return {
    proProductId: proId!,
    studioProductId: studioId!,
    extraSlotsProductId: extraSlotsId!,
    isLiveApi: true,
  };
}

/**
 * Signs a raw JSON payload according to the Standard Webhooks specification
 * (`webhook-id.webhook-timestamp.raw_body`, HMAC-SHA256, base64).
 */
export async function signStandardWebhookPayload(
  rawBody: string,
  webhookKey: string,
  webhookId: string,
  webhookTimestamp: string
): Promise<string> {
  const idx = webhookKey.indexOf("_");
  const cleanSecret = idx !== -1 ? webhookKey.slice(idx + 1) : webhookKey;

  const binarySecret = Uint8Array.from(atob(cleanSecret), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    binarySecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const toSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(toSign)
  );
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  return `v1,${sigBase64}`;
}
