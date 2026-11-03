/**
 * Whether this deployment enforces billing (#521, ADR 0016 "Shipping dark: BILLING_ENFORCED").
 * Pure: no React, no Next, no Supabase.
 *
 * Only the exact string "true" turns it on. Unset, empty, "1", "TRUE", " true" and anything else
 * leave it off, so a typo can never lock a workspace out: billing ships switched off. The
 * database's own switch is `private.billing_config.enforced`; the owner turns both on together.
 */
export function billingEnforced(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.BILLING_ENFORCED === "true";
}

/** Who is told what when a write is refused: the founder manages billing, everyone else asks. */
export interface ReadOnlyState {
  readOnly: true;
  /** The teacher who started the workspace, who can subscribe on /author/workspace. */
  canManage: boolean;
}

/**
 * Whether an author may write, from the enforcement switch and the database's access answer.
 * `access` is null when `workspace_access()` gave no row or could not answer: the app then lets
 * the write through and the database's own gate decides (it reads the same check), rather than
 * refusing every teacher over one failed read.
 */
export function readOnlyFor(
  enforced: boolean,
  access: { hasAccess: boolean; canManage: boolean } | null,
): ReadOnlyState | null {
  if (!enforced || !access || access.hasAccess) return null;
  return { readOnly: true, canManage: access.canManage };
}
