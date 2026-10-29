import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BillingStore, SubscriptionStatus, WorkspaceBillingRow } from "./sync";

type ServiceClient = SupabaseClient<Database>;

/** `record_trial_use` raises this when no account has the profile id. */
const NO_DATA_FOUND = "P0002";

// One literal, so supabase-js can type the rows it returns.
const COLUMNS =
  "org_id, stripe_customer_id, stripe_subscription_id, status, price_lookup_key, current_period_end, trial_end, cancel_at_period_end, billing_email, livemode";

type StoredRow = Omit<
  Database["public"]["Tables"]["workspace_billing"]["Row"],
  "created_at" | "updated_at"
>;

function toRow(row: StoredRow): WorkspaceBillingRow {
  return {
    org_id: row.org_id,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    // `workspace_billing_status_check` allows exactly SUBSCRIPTION_STATUSES.
    status: row.status as SubscriptionStatus | null,
    price_lookup_key: row.price_lookup_key,
    current_period_end: row.current_period_end,
    trial_end: row.trial_end,
    cancel_at_period_end: row.cancel_at_period_end,
    billing_email: row.billing_email,
    livemode: row.livemode,
  };
}

/** Errors carry Postgres's code and message only; never a row, so never an address. */
function failure(what: string, error: { code?: string; message: string }): Error {
  return new Error(`${what} failed (${error.code ?? "no code"}): ${error.message}`);
}

/**
 * The database side of the sync, through the service-role client (`createSupabaseServiceClient`).
 * `workspace_billing` is granted to service_role for exactly this; the three functions are
 * granted to it and to nobody else (20261027000000_billing.sql). Every call throws on error, so
 * the webhook answers 500 and Stripe retries.
 */
export function supabaseBillingStore(client: ServiceClient): BillingStore {
  async function findOne(column: "org_id" | "stripe_customer_id", value: string) {
    const { data, error } = await client
      .from("workspace_billing")
      .select(COLUMNS)
      .eq(column, value)
      .maybeSingle();
    if (error) throw failure("reading workspace_billing", error);
    return data ? toRow(data) : null;
  }

  return {
    findByCustomer: (customerId) => findOne("stripe_customer_id", customerId),
    findByOrg: (orgId) => findOne("org_id", orgId),
    async upsert(row) {
      const { error } = await client
        .from("workspace_billing")
        .upsert(row, { onConflict: "org_id" });
      if (error) throw failure("writing workspace_billing", error);
    },
    async mayStartTrial(profileId, orgId) {
      const { data, error } = await client.rpc("may_start_trial", {
        p_profile: profileId,
        p_org: orgId,
      });
      if (error) throw failure("may_start_trial", error);
      return data === true;
    },
    async recordTrialUse(profileId, orgId, subscriptionId) {
      const { error } = await client.rpc("record_trial_use", {
        p_profile: profileId,
        p_org: orgId,
        p_subscription: subscriptionId,
      });
      if (error?.code === NO_DATA_FOUND) return "no_account";
      if (error) throw failure("record_trial_use", error);
      return "recorded";
    },
  };
}

/** `claim_stripe_event`: true when the id is new and now recorded, false when seen before. */
export async function claimStripeEvent(
  client: ServiceClient,
  event: { id: string; type: string; livemode: boolean },
): Promise<boolean> {
  const { data, error } = await client.rpc("claim_stripe_event", {
    p_id: event.id,
    p_type: event.type,
    p_livemode: event.livemode,
  });
  if (error) throw failure("claim_stripe_event", error);
  return data === true;
}
