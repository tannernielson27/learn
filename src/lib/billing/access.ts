/**
 * What a workspace's billing state is, from the one row `public.workspace_access()` answers
 * (#517), for the billing page (#519) to word. Pure: no React, no Next, no Supabase, no Stripe.
 * It decides nothing: `hasAccess` is the database's answer, and nothing enforces it until #521.
 * It holds no interface wording either, which belongs to the page and docs/glossary.md.
 */

/** Free access that does not come from Stripe (`public.access_grants.kind`). */
export type GrantKind = "exempt" | "grandfathered" | "beta";

/**
 * The row as the database sends it. Every column but `has_access` and `source` can be null
 * (no grant, no subscription in this deployment's mode), whatever the generated types say.
 */
export type WorkspaceAccessRow = {
  has_access: boolean;
  source: string;
  grant_kind: string | null;
  status: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  is_founder: boolean | null;
};

export type BillingState =
  /** On a grant: nothing to pay, nothing to manage. */
  | { kind: "free"; grant: GrantKind }
  /** In the free trial. `convertsToPaid` is false once the founder has cancelled it. */
  | { kind: "trial"; endsAt: string | null; convertsToPaid: boolean }
  /** Paying. `renews` is false once cancelled: access ends at `periodEndsAt`. */
  | { kind: "active"; periodEndsAt: string | null; renews: boolean }
  /** A payment failed and Stripe is retrying. Access continues meanwhile. */
  | { kind: "payment_failed"; periodEndsAt: string | null }
  /** No access: never subscribed (`status` null) or lapsed (`status` is Stripe's). */
  | { kind: "none"; status: string | null };

export type WorkspaceAccess = {
  hasAccess: boolean;
  /** Only the teacher who founded the workspace manages its billing. */
  canManage: boolean;
  state: BillingState;
};

const GRANT_KINDS: readonly string[] = ["exempt", "grandfathered", "beta"] satisfies GrantKind[];

function isGrantKind(value: string | null): value is GrantKind {
  return value !== null && GRANT_KINDS.includes(value);
}

/**
 * The view of a `workspace_access()` row, or null when there is no row: the caller is not a
 * teacher of a workspace, and the page shows nothing about billing.
 */
export function toWorkspaceAccess(
  row: WorkspaceAccessRow | null | undefined,
): WorkspaceAccess | null {
  if (!row) return null;
  return { hasAccess: row.has_access, canManage: row.is_founder === true, state: stateOf(row) };
}

function stateOf(row: WorkspaceAccessRow): BillingState {
  if (row.source === "grant" && isGrantKind(row.grant_kind)) {
    return { kind: "free", grant: row.grant_kind };
  }
  const renews = row.cancel_at_period_end !== true;
  switch (row.source === "subscription" ? row.status : null) {
    case "trialing":
      return { kind: "trial", endsAt: row.trial_end, convertsToPaid: renews };
    case "active":
      return { kind: "active", periodEndsAt: row.current_period_end, renews };
    case "past_due":
      return { kind: "payment_failed", periodEndsAt: row.current_period_end };
    default:
      return { kind: "none", status: row.status };
  }
}
