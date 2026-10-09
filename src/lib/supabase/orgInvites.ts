import type { SupabaseClient } from "@supabase/supabase-js";
import { clipInviteToken } from "@/lib/classes/classes";
import {
  type AcceptInviteResult,
  INVITE_REFUSALS,
  INVITE_STATES,
  type InviteState,
} from "@/lib/workspace/invite";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export interface FoundOrgInvite {
  status: "found";
  state: InviteState;
  /** As the inviter typed it. Shown as text only. */
  workspaceName: string;
  inviterName: string | null;
  inviterEmail: string | null;
  invitedEmail: string;
  expiresAt: string;
}

/**
 * - `found`: a token that was issued, with what it is for and where it stands.
 * - `invalid`: no such token, or a caller the lookup has stopped answering (`PT429`). One answer
 *   for both, so a guesser who is being refused cannot tell that from guessing wrong.
 * - `unavailable`: the database could not answer. Nothing is known about the token.
 */
export type ResolvedOrgInvite = FoundOrgInvite | { status: "invalid" } | { status: "unavailable" };

const RATE_LIMITED = "PT429";

function logFailure(step: string, error: { code?: string } | null): void {
  // The code and nothing else: never the token, an address or the error's message.
  console.error(`[workspace-invite] ${step} failed`, { code: error?.code });
}

/**
 * Looks a workspace invitation up with the service-role client (`resolve_org_invite` is granted to
 * nobody else), counting a miss against `clientIp`, which must come from `clientIp()` and never
 * from a header the caller chose.
 *
 * As `resolveClassInvite`: nothing is answered without asking the database, so an unknown and a
 * malformed token cost the same and read the same.
 */
export async function resolveOrgInvite(
  service: Client,
  token: string,
  clientIp: string | null,
): Promise<ResolvedOrgInvite> {
  const { data, error } = await service.rpc("resolve_org_invite", {
    token: clipInviteToken(token),
    client_key: clientIp ?? undefined,
  });
  if (error) {
    if (error.code === RATE_LIMITED) return { status: "invalid" };
    logFailure("looking an invitation up", error);
    return { status: "unavailable" };
  }
  const row = data?.[0];
  if (!row) return { status: "invalid" };
  const state = INVITE_STATES.find((known) => known === row.state);
  if (!state) {
    logFailure("reading an invitation's state", null);
    return { status: "unavailable" };
  }
  return {
    status: "found",
    state,
    workspaceName: row.workspace_name,
    inviterName: row.inviter_name ?? null,
    inviterEmail: row.inviter_email ?? null,
    invitedEmail: row.invited_email,
    expiresAt: row.expires_at,
  };
}

/** Everything `accept_org_invite` answers, and `unavailable` for a database that did not. */
export type AcceptOrgInviteResult = AcceptInviteResult;

const ACCEPT_RESULTS = new Set<string>([
  "accepted",
  "invalid",
  "already_accepted",
  "revoked",
  "expired",
  ...INVITE_REFUSALS,
]);

/**
 * Accepts an invitation for `userId` with the service-role client. `userId` is the account the
 * server has just verified (`auth.getUser()`) or just made; it is never read from a request.
 * The database counts no misses here, so the caller resolves the token first.
 */
export async function acceptOrgInvite(
  service: Client,
  userId: string,
  token: string,
): Promise<AcceptOrgInviteResult> {
  const { data, error } = await service.rpc("accept_org_invite", {
    p_user: userId,
    token: clipInviteToken(token),
  });
  if (error || typeof data !== "string" || !ACCEPT_RESULTS.has(data)) {
    logFailure("accepting an invitation", error);
    return "unavailable";
  }
  return data as AcceptOrgInviteResult;
}
