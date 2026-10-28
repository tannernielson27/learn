import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { claimStripeEvent, supabaseBillingStore } from "./billingStore";
import type { WorkspaceBillingRow } from "./sync";
import { CUSTOMER, ORG, PROFILE } from "./testing/fakes";

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

/** A Supabase client that records each call and answers with what the test hands it. */
function fakeClient(answers: { query?: Result; rpc?: Result } = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const record =
    (op: string, result?: Result) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
      return result ? Promise.resolve({ data: null, error: null, ...result }) : builder;
    };
  const builder: Record<string, unknown> = {};
  builder.select = record("select");
  builder.eq = record("eq");
  builder.maybeSingle = record("maybeSingle", answers.query ?? {});
  builder.upsert = record("upsert", answers.query ?? {});
  const client = {
    from: vi.fn((table: string) => {
      calls.push({ op: "from", args: [table] });
      return builder;
    }),
    rpc: vi.fn((name: string, args: unknown) => {
      calls.push({ op: "rpc", args: [name, args] });
      return Promise.resolve({ data: null, error: null, ...answers.rpc });
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const ROW: WorkspaceBillingRow = {
  org_id: ORG,
  stripe_customer_id: CUSTOMER,
  stripe_subscription_id: "sub_1",
  status: "active",
  price_lookup_key: "learn_monthly_v1",
  current_period_end: "2026-11-04T00:00:00+00:00",
  trial_end: null,
  cancel_at_period_end: false,
  billing_email: "founder@school.test",
  livemode: false,
};

describe("supabaseBillingStore", () => {
  it("reads one row by customer or by workspace", async () => {
    const { client, calls } = fakeClient({ query: { data: { ...ROW } } });
    const store = supabaseBillingStore(client);
    expect(await store.findByCustomer(CUSTOMER)).toEqual(ROW);
    expect(await store.findByOrg(ORG)).toEqual(ROW);
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["stripe_customer_id", CUSTOMER],
      ["org_id", ORG],
    ]);
    expect(calls.find((c) => c.op === "from")?.args).toEqual(["workspace_billing"]);
  });

  it("answers null for no row, and throws on an error without the row in it", async () => {
    expect(await supabaseBillingStore(fakeClient().client).findByOrg(ORG)).toBeNull();
    const broken = fakeClient({ query: { error: { code: "42501", message: "denied" } } });
    await expect(supabaseBillingStore(broken.client).findByOrg(ORG)).rejects.toThrow(
      "reading workspace_billing failed (42501): denied",
    );
  });

  it("upserts on the workspace", async () => {
    const { client, calls } = fakeClient();
    await supabaseBillingStore(client).upsert(ROW);
    expect(calls.find((c) => c.op === "upsert")?.args).toEqual([ROW, { onConflict: "org_id" }]);
    const broken = fakeClient({ query: { error: { message: "check violation" } } });
    await expect(supabaseBillingStore(broken.client).upsert(ROW)).rejects.toThrow(
      "writing workspace_billing failed (no code): check violation",
    );
  });

  it("asks may_start_trial and records a trial through the two functions", async () => {
    const yes = fakeClient({ rpc: { data: true } });
    expect(await supabaseBillingStore(yes.client).mayStartTrial(PROFILE, ORG)).toBe(true);
    expect(yes.calls.at(-1)?.args).toEqual(["may_start_trial", { p_profile: PROFILE, p_org: ORG }]);
    const { client, calls } = fakeClient();
    expect(await supabaseBillingStore(client).recordTrialUse(PROFILE, ORG, "sub_1")).toBe(
      "recorded",
    );
    expect(calls.at(-1)?.args).toEqual([
      "record_trial_use",
      { p_profile: PROFILE, p_org: ORG, p_subscription: "sub_1" },
    ]);
  });

  it("reads P0002 from record_trial_use as no account, and throws anything else", async () => {
    const gone = fakeClient({ rpc: { error: { code: "P0002", message: "no account" } } });
    expect(await supabaseBillingStore(gone.client).recordTrialUse(PROFILE, ORG, "sub_1")).toBe(
      "no_account",
    );
    const broken = fakeClient({ rpc: { error: { code: "XX000", message: "boom" } } });
    const store = supabaseBillingStore(broken.client);
    await expect(store.recordTrialUse(PROFILE, ORG, "sub_1")).rejects.toThrow("record_trial_use");
    await expect(store.mayStartTrial(PROFILE, ORG)).rejects.toThrow("may_start_trial");
  });
});

describe("claimStripeEvent", () => {
  it("is true for a new id and false for one seen before", async () => {
    const event = { id: "evt_1", type: "invoice.paid", livemode: false };
    const fresh = fakeClient({ rpc: { data: true } });
    expect(await claimStripeEvent(fresh.client, event)).toBe(true);
    expect(fresh.calls.at(-1)?.args).toEqual([
      "claim_stripe_event",
      { p_id: "evt_1", p_type: "invoice.paid", p_livemode: false },
    ]);
    expect(await claimStripeEvent(fakeClient({ rpc: { data: false } }).client, event)).toBe(false);
    const broken = fakeClient({ rpc: { error: { message: "down" } } });
    await expect(claimStripeEvent(broken.client, event)).rejects.toThrow("claim_stripe_event");
  });
});
