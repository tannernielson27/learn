import type { SupabaseClient } from "@supabase/supabase-js";
import { clipInviteToken } from "@/lib/classes/classes";
import {
  type AcceptInviteResult,
  INVITE_REFUSALS,
  INVITE_STATES,
  type InviteState,
} from "@/lib/workspace/invite";
import type { MovePreview } from "@/lib/workspace/membership";
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
  "move_needs_confirmation",
  ...INVITE_REFUSALS,
]);

/** PostgREST: no function of that name takes those arguments. */
const NO_SUCH_FUNCTION = "PGRST202";

/**
 * Accepts an invitation for `userId` with the service-role client. `userId` is the account the
 * server has just verified (`auth.getUser()`) or just made; it is never read from a request.
 * The database counts no misses here, so the caller resolves the token first.
 *
 * `confirmMove` is the person's own statement, posted with the form, that they accept leaving the
 * workspace they teach in. It matters only for an account that teaches: without it the database
 * answers `move_needs_confirmation` and writes nothing.
 *
 * The argument is sent only when it is true. A database without migration 20261011000000 has the
 * two-argument function, which a call naming two arguments reaches on either side of the
 * migration. If a confirmed call finds no three-argument function, it is made again without the
 * confirmation, and that older function answers a teacher `already_teaches`, as it always did.
 */
export async function acceptOrgInvite(
  service: Client,
  userId: string,
  token: string,
  confirmMove = false,
): Promise<AcceptOrgInviteResult> {
  const args = { p_user: userId, token: clipInviteToken(token) };
  let { data, error } = await service.rpc(
    "accept_org_invite",
    confirmMove ? { ...args, p_confirm_move: true } : args,
  );
  if (confirmMove && error?.code === NO_SUCH_FUNCTION) {
    ({ data, error } = await service.rpc("accept_org_invite", args));
  }
  if (error || typeof data !== "string" || !ACCEPT_RESULTS.has(data)) {
    logFailure("accepting an invitation", error);
    return "unavailable";
  }
  return data as AcceptOrgInviteResult;
}

/**
 * What accepting would do to an account that already teaches.
 *
 * - `move`: accepting would move the account out of the workspace named, once it confirms.
 * - `refused`: the account teaches and may not move, for the reason given.
 * - `not_teaching`: the account has no role or is a student; there is no move to describe.
 * - `unknown`: the database could not say. That includes a database without migration
 *   20261011000000, which has no such function: the page then says what it said before it.
 */
export type OrgMovePreview =
  | ({ status: "move" } & MovePreview)
  | { status: "refused"; reason: MoveRefusal }
  | { status: "not_teaching" }
  | { status: "unknown" };

const MOVE_REFUSALS = [
  "wrong_address",
  "already_member",
  "teaches_shared",
  "founder_with_members",
  "students_depend",
] as const;
export type MoveRefusal = (typeof MOVE_REFUSALS)[number];

function countOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Asks `org_invite_move_preview` with the service-role client, for the account the server has
 * just verified. It changes nothing and counts no misses: the caller has resolved the token.
 */
export async function previewOrgMove(
  service: Client,
  userId: string,
  token: string,
): Promise<OrgMovePreview> {
  const { data, error } = await service.rpc("org_invite_move_preview", {
    p_user: userId,
    token: clipInviteToken(token),
  });
  if (error) {
    // Expected until the migration is applied, so that one code is not logged as a failure.
    if (error.code !== NO_SUCH_FUNCTION) logFailure("previewing a move", error);
    return { status: "unknown" };
  }
  const row = Array.isArray(data) ? data[0] : undefined;
  if (row?.status === "not_teaching") return { status: "not_teaching" };
  const reason = MOVE_REFUSALS.find((known) => known === row?.status);
  if (reason) return { status: "refused", reason };
  const bankCount = countOf(row?.bank_count);
  const classCount = countOf(row?.class_count);
  if (
    row?.status === "move_needs_confirmation" &&
    typeof row.leaving_workspace === "string" &&
    bankCount !== null &&
    classCount !== null
  ) {
    return { status: "move", leavingWorkspace: row.leaving_workspace, bankCount, classCount };
  }
  if (row?.status !== "invalid") logFailure("reading a move preview", null);
  return { status: "unknown" };
}
