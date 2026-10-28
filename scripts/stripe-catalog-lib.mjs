// #518: what `scripts/stripe-catalog.mjs` decides, kept free of I/O so it can be unit-tested
// (scripts/stripe-catalog.test.ts). The runner builds the Stripe client and prints.
//
// Idempotent by lookup, never by memory: the price is found by its lookup key, the product by the
// price (or by its metadata), the Customer Portal configuration by its metadata. Something that
// exists is reported and never changed; something that exists with the wrong terms is reported
// as a mismatch for the owner to settle in the dashboard, and the run exits non-zero.

export const PRODUCT_NAME = "LeaRN workspace";
export const PRODUCT_DESCRIPTION = "LeaRN for one workspace, up to 10 teachers.";
export const PRODUCT_METADATA = { learn_catalog: "workspace" };

export const PRICE_LOOKUP_KEY = "learn_monthly_v1";
export const PRICE_TERMS = {
  unit_amount: 3999,
  currency: "usd",
  interval: "month",
  interval_count: 1,
};

export const PORTAL_METADATA = { learn_catalog: "portal_v1" };

/** ADR 0016: cancel at period end, card and invoices, no plan changes, a trial keeps going. */
export const PORTAL_FEATURES = {
  customer_update: { enabled: false },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
  subscription_update: { enabled: false, trial_update_behavior: "continue_trial" },
};

export const USAGE = `Usage: pnpm stripe:catalog [-- --live]

Reads STRIPE_SECRET_KEY from the environment (pnpm stripe:catalog loads .env.local if it exists;
or: node --env-file=.env.local scripts/stripe-catalog.mjs). Finds or creates the "${PRODUCT_NAME}"
product, its $39.99 monthly price with lookup key ${PRICE_LOOKUP_KEY}, and the Customer Portal
configuration. Running it again changes nothing.

  --live   required to run with a live key (sk_live_, rk_live_). Without it a live key is refused.
  --help   this text.`;

/**
 * @param {readonly string[]} argv
 * @returns {{ live: boolean, help: boolean }}
 */
export function parseCatalogArgs(argv) {
  const options = { live: false, help: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--live") options.live = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/**
 * Whether the key may be used for this run. Never echoes the key.
 * @param {string | undefined} rawKey
 * @param {{ live: boolean }} options
 * @returns {{ ok: true, key: string, mode: "test" | "live" } | { ok: false, reason: string }}
 */
export function checkCatalogKey(rawKey, options) {
  const key = (rawKey ?? "").trim();
  if (!key) return { ok: false, reason: "STRIPE_SECRET_KEY is not set (see docs/05 §7.15 step 1)" };
  const mode = /^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key)
    ? "test"
    : /^(sk|rk)_live_[A-Za-z0-9_]+$/.test(key)
      ? "live"
      : null;
  if (!mode) {
    return { ok: false, reason: "STRIPE_SECRET_KEY is not a secret or restricted key (sk_/rk_)" };
  }
  if (mode === "live" && !options.live) {
    return {
      ok: false,
      reason: "a live key: pass --live to change the live catalog (docs/05 §7.15 step 5)",
    };
  }
  if (mode === "test" && options.live) {
    return { ok: false, reason: "--live was passed with a test key; leave it off for a sandbox" };
  }
  return { ok: true, key, mode };
}

/**
 * Every item of a Stripe list, page by page.
 * @template T
 * @param {(params: Record<string, unknown>) => Promise<{ data: T[], has_more: boolean }>} list
 * @param {Record<string, unknown>} params
 * @returns {Promise<T[]>}
 */
export async function listAll(list, params) {
  const items = [];
  let startingAfter;
  for (;;) {
    const page = await list({
      ...params,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    items.push(...page.data);
    if (!page.has_more || page.data.length === 0) return items;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

/** @param {Record<string, string> | null | undefined} metadata @param {Record<string, string>} want */
function hasMetadata(metadata, want) {
  return Object.entries(want).every(([key, value]) => metadata?.[key] === value);
}

/** What is wrong with a price that carries the lookup key, or an empty list. */
export function priceProblems(price) {
  const problems = [];
  if (!price.active) problems.push("it is archived");
  if (price.unit_amount !== PRICE_TERMS.unit_amount)
    problems.push(`unit_amount is ${price.unit_amount}`);
  if (price.currency !== PRICE_TERMS.currency) problems.push(`currency is ${price.currency}`);
  if (price.recurring?.interval !== PRICE_TERMS.interval) {
    problems.push(`interval is ${price.recurring?.interval ?? "none (one-time)"}`);
  }
  if ((price.recurring?.interval_count ?? 1) !== PRICE_TERMS.interval_count) {
    problems.push(`interval_count is ${price.recurring?.interval_count}`);
  }
  return problems;
}

/** What differs between a portal configuration and PORTAL_FEATURES, or an empty list. */
export function portalProblems(configuration) {
  const problems = [];
  const features = configuration.features ?? {};
  for (const [feature, want] of Object.entries(PORTAL_FEATURES)) {
    for (const [field, value] of Object.entries(want)) {
      const have = features[feature]?.[field];
      if (have !== value) problems.push(`${feature}.${field} is ${JSON.stringify(have)}`);
    }
  }
  return problems;
}

/**
 * @typedef {{ what: "product" | "price" | "portal", outcome: "found" | "created" | "mismatch", id: string, detail?: string }} CatalogLine
 */

/**
 * Finds or creates the product, the price and the portal configuration.
 * @param {any} stripe a Stripe client, or a test double with the same few methods
 * @returns {Promise<CatalogLine[]>}
 */
export async function ensureCatalog(stripe) {
  const lines = [];

  const [existingPrice] = (await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 1 }))
    .data;

  let productId;
  if (existingPrice) {
    productId =
      typeof existingPrice.product === "string" ? existingPrice.product : existingPrice.product.id;
    lines.push({ what: "product", outcome: "found", id: productId, detail: "the price's product" });
  } else {
    const products = await listAll((params) => stripe.products.list(params), { active: true });
    const product = products.find((candidate) => hasMetadata(candidate.metadata, PRODUCT_METADATA));
    if (product) {
      productId = product.id;
      lines.push({ what: "product", outcome: "found", id: product.id, detail: product.name });
    } else {
      const created = await stripe.products.create({
        name: PRODUCT_NAME,
        description: PRODUCT_DESCRIPTION,
        metadata: PRODUCT_METADATA,
      });
      productId = created.id;
      lines.push({ what: "product", outcome: "created", id: created.id, detail: PRODUCT_NAME });
    }
  }

  if (existingPrice) {
    const problems = priceProblems(existingPrice);
    lines.push(
      problems.length === 0
        ? { what: "price", outcome: "found", id: existingPrice.id, detail: PRICE_LOOKUP_KEY }
        : {
            what: "price",
            outcome: "mismatch",
            id: existingPrice.id,
            detail: `${PRICE_LOOKUP_KEY}: ${problems.join("; ")}. A new price needs a new lookup key`,
          },
    );
  } else {
    const created = await stripe.prices.create({
      product: productId,
      unit_amount: PRICE_TERMS.unit_amount,
      currency: PRICE_TERMS.currency,
      recurring: { interval: PRICE_TERMS.interval, interval_count: PRICE_TERMS.interval_count },
      lookup_key: PRICE_LOOKUP_KEY,
      nickname: "LeaRN monthly",
    });
    lines.push({ what: "price", outcome: "created", id: created.id, detail: PRICE_LOOKUP_KEY });
  }

  const configurations = await listAll(
    (params) => stripe.billingPortal.configurations.list(params),
    { active: true },
  );
  const portal = configurations.find((candidate) =>
    hasMetadata(candidate.metadata, PORTAL_METADATA),
  );
  if (portal) {
    const problems = portalProblems(portal);
    lines.push(
      problems.length === 0
        ? { what: "portal", outcome: "found", id: portal.id }
        : { what: "portal", outcome: "mismatch", id: portal.id, detail: problems.join("; ") },
    );
  } else {
    const created = await stripe.billingPortal.configurations.create({
      name: PRODUCT_NAME,
      features: PORTAL_FEATURES,
      metadata: PORTAL_METADATA,
    });
    lines.push({ what: "portal", outcome: "created", id: created.id });
  }

  return lines;
}

/** @param {CatalogLine[]} lines */
export function formatCatalog(lines, mode) {
  const rows = lines.map(
    ({ what, outcome, id, detail }) =>
      `${outcome.toUpperCase().padEnd(8)} ${what.padEnd(7)} ${id}${detail ? `  ${detail}` : ""}`,
  );
  return [`Stripe catalog (${mode} mode):`, ...rows].join("\n");
}

/** @param {CatalogLine[]} lines */
export function catalogExitCode(lines) {
  return lines.some((line) => line.outcome === "mismatch") ? 1 : 0;
}
