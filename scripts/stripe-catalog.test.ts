import { describe, expect, it, vi } from "vitest";
import {
  PORTAL_FEATURES,
  PORTAL_METADATA,
  PRICE_LOOKUP_KEY,
  PRODUCT_METADATA,
  catalogExitCode,
  checkCatalogKey,
  ensureCatalog,
  formatCatalog,
  listAll,
  parseCatalogArgs,
} from "./stripe-catalog-lib.mjs";

type Obj = Record<string, unknown> & { id: string };

/** A Stripe account in memory: just the lists and creates the catalog uses. */
function fakeAccount(seed: { products?: Obj[]; prices?: Obj[]; portals?: Obj[] } = {}) {
  const products = [...(seed.products ?? [])];
  const prices = [...(seed.prices ?? [])];
  const portals = [...(seed.portals ?? [])];
  let n = 0;
  const page = (data: Obj[]) => Promise.resolve({ data, has_more: false });
  const stripe = {
    products: {
      list: vi.fn((params: { active?: boolean }) =>
        page(products.filter((p) => params.active === undefined || p.active === params.active)),
      ),
      create: vi.fn(async (params: Record<string, unknown>) => {
        const product = { id: `prod_${++n}`, active: true, ...params };
        products.push(product);
        return product;
      }),
    },
    prices: {
      list: vi.fn((params: { lookup_keys: string[] }) =>
        page(prices.filter((p) => params.lookup_keys.includes(p.lookup_key as string))),
      ),
      create: vi.fn(async (params: Record<string, unknown>) => {
        const { recurring, ...rest } = params as { recurring: object };
        const price = { id: `price_${++n}`, active: true, recurring, ...rest };
        prices.push(price);
        return price;
      }),
    },
    billingPortal: {
      configurations: {
        list: vi.fn(() => page(portals)),
        create: vi.fn(async (params: Record<string, unknown>) => {
          const portal = { id: `bpc_${++n}`, active: true, ...params };
          portals.push(portal);
          return portal;
        }),
      },
    },
  };
  return { stripe, products, prices, portals };
}

describe("ensureCatalog", () => {
  it("creates the product, the $39.99 monthly price and the portal on an empty account", async () => {
    const account = fakeAccount();
    const lines = await ensureCatalog(account.stripe);
    expect(lines.map((l) => [l.what, l.outcome])).toEqual([
      ["product", "created"],
      ["price", "created"],
      ["portal", "created"],
    ]);
    expect(account.stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "LeaRN workspace", metadata: PRODUCT_METADATA }),
    );
    expect(account.stripe.prices.create).toHaveBeenCalledWith({
      product: "prod_1",
      unit_amount: 3999,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
      lookup_key: "learn_monthly_v1",
      nickname: "LeaRN monthly",
    });
    const portal = account.stripe.billingPortal.configurations.create.mock.calls[0][0];
    expect(portal.metadata).toEqual(PORTAL_METADATA);
    expect(portal.features).toEqual({
      customer_update: { enabled: false },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: { enabled: false, trial_update_behavior: "continue_trial" },
    });
    expect(catalogExitCode(lines)).toBe(0);
  });

  it("finds everything on a second run and creates nothing", async () => {
    const account = fakeAccount();
    await ensureCatalog(account.stripe);
    const second = await ensureCatalog(account.stripe);
    expect(second.map((l) => l.outcome)).toEqual(["found", "found", "found"]);
    expect(account.products).toHaveLength(1);
    expect(account.prices).toHaveLength(1);
    expect(account.portals).toHaveLength(1);
    expect(account.stripe.products.create).toHaveBeenCalledTimes(1);
    expect(account.stripe.prices.create).toHaveBeenCalledTimes(1);
  });

  it("finds the product by its metadata when the price is missing, and adds only the price", async () => {
    const account = fakeAccount({
      products: [
        { id: "prod_other", active: true, name: "Something else", metadata: {} },
        { id: "prod_ws", active: true, name: "LeaRN workspace", metadata: PRODUCT_METADATA },
      ],
    });
    const lines = await ensureCatalog(account.stripe);
    expect(lines[0]).toMatchObject({ what: "product", outcome: "found", id: "prod_ws" });
    expect(account.stripe.prices.create.mock.calls[0][0].product).toBe("prod_ws");
    expect(account.stripe.products.create).not.toHaveBeenCalled();
  });

  it("reports a price with the lookup key but other terms, and changes nothing", async () => {
    const account = fakeAccount({
      prices: [
        {
          id: "price_old",
          active: true,
          product: { id: "prod_ws" },
          lookup_key: PRICE_LOOKUP_KEY,
          unit_amount: 2999,
          currency: "usd",
          recurring: { interval: "year", interval_count: 1 },
        },
      ],
    });
    const lines = await ensureCatalog(account.stripe);
    expect(lines[0]).toMatchObject({ what: "product", id: "prod_ws", outcome: "found" });
    expect(lines[1]).toMatchObject({ what: "price", outcome: "mismatch", id: "price_old" });
    expect(lines[1].detail).toContain("unit_amount is 2999");
    expect(lines[1].detail).toContain("interval is year");
    expect(account.stripe.prices.create).not.toHaveBeenCalled();
    expect(catalogExitCode(lines)).toBe(1);
  });

  it("reports an archived or one-time price under the key", async () => {
    const account = fakeAccount({
      prices: [
        {
          id: "price_x",
          active: false,
          product: "prod_ws",
          lookup_key: PRICE_LOOKUP_KEY,
          unit_amount: 3999,
          currency: "eur",
          recurring: null,
        },
      ],
    });
    const [, price] = await ensureCatalog(account.stripe);
    expect(price.outcome).toBe("mismatch");
    expect(price.detail).toContain("archived");
    expect(price.detail).toContain("currency is eur");
    expect(price.detail).toContain("one-time");
  });

  it("reports a portal configuration that drifted, and leaves it", async () => {
    const account = fakeAccount({
      portals: [
        { id: "bpc_default", active: true, metadata: {}, features: {} },
        {
          id: "bpc_learn",
          active: true,
          metadata: PORTAL_METADATA,
          features: {
            ...PORTAL_FEATURES,
            subscription_cancel: { ...PORTAL_FEATURES.subscription_cancel, mode: "immediately" },
          },
        },
      ],
    });
    const lines = await ensureCatalog(account.stripe);
    expect(lines[2]).toMatchObject({ what: "portal", outcome: "mismatch", id: "bpc_learn" });
    expect(lines[2].detail).toBe('subscription_cancel.mode is "immediately"');
    expect(account.stripe.billingPortal.configurations.create).not.toHaveBeenCalled();
  });
});

describe("checkCatalogKey", () => {
  it("refuses a live key without --live, and --live with a test key", () => {
    expect(checkCatalogKey("sk_live_fake", { live: false })).toMatchObject({ ok: false });
    expect(checkCatalogKey("rk_live_fake", { live: false })).toMatchObject({ ok: false });
    expect(checkCatalogKey("sk_live_fake", { live: true })).toEqual({
      ok: true,
      key: "sk_live_fake",
      mode: "live",
    });
    expect(checkCatalogKey("sk_test_fake", { live: true })).toMatchObject({ ok: false });
    expect(checkCatalogKey(" sk_test_fake ", { live: false })).toEqual({
      ok: true,
      key: "sk_test_fake",
      mode: "test",
    });
  });

  it("refuses a missing or wrong-shaped key without echoing it", () => {
    for (const key of [undefined, "", "pk_test_publishable", "whsec_x"]) {
      const result = checkCatalogKey(key, { live: false });
      expect(result.ok).toBe(false);
      if (!result.ok && key) expect(result.reason).not.toContain(key);
    }
  });
});

describe("parseCatalogArgs", () => {
  it("reads --live and --help, skips pnpm's --, and refuses anything else", () => {
    expect(parseCatalogArgs([])).toEqual({ live: false, help: false });
    expect(parseCatalogArgs(["--", "--live"])).toEqual({ live: true, help: false });
    expect(parseCatalogArgs(["-h"])).toEqual({ live: false, help: true });
    expect(() => parseCatalogArgs(["--force"])).toThrow("unknown argument: --force");
  });
});

describe("listAll and formatCatalog", () => {
  it("follows has_more with starting_after", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: "a" }, { id: "b" }], has_more: true })
      .mockResolvedValueOnce({ data: [{ id: "c" }], has_more: false });
    expect(await listAll(list, { active: true })).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(list.mock.calls[1][0]).toEqual({ active: true, limit: 100, starting_after: "b" });
  });

  it("prints one line per object, found or created", () => {
    const text = formatCatalog(
      [
        { what: "product", outcome: "found", id: "prod_1", detail: "LeaRN workspace" },
        { what: "price", outcome: "created", id: "price_1" },
      ],
      "test",
    );
    expect(text).toBe(
      [
        "Stripe catalog (test mode):",
        "FOUND    product prod_1  LeaRN workspace",
        "CREATED  price   price_1",
      ].join("\n"),
    );
  });
});
