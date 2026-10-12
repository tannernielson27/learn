import type { SupabaseClient } from "@supabase/supabase-js";
import { REMOVE_ANSWERS, type RemovedMember } from "@/lib/workspace/membership";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * A teacher's workspace, its members and its invitations (migration 20261009010000). Every read
 * here runs as the signed-in author, so row level security and `org_members` keep it to their own
 * workspace. `createOrgInvite` is the one call made as the service role, for the reason in the
 * migration's header: the token it returns must reach nobody but the invited inbox.
 *
 * A failure carries only the database's error code. Its message can quote an address.
 */

export interface Workspace {
  name: string;
  /** `orgs.self_registered`: a teacher made it by signing up, so its members may invite. */
  selfRegistered: boolean;
}

export interface WorkspaceMember {
  profileId: string;
  displayName: string | null;
  email: string;
  role: Database["public"]["Enums"]["org_role"];
  joinedAt: string;
}

/** An invitation nobody has accepted or revoked. It may have expired: see `isInviteExpired`. */
export interface OpenInvite {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

/** More than a workspace can hold open, so the list is bounded whatever the table holds. */
const OPEN_INVITE_LIMIT = 50;

/**
 * The columns `authenticated` may read. `token_hash` has no grant, so `select("*")` is refused
 * (42501): every read of this table names its columns.
 */
const OPEN_INVITE_COLUMNS = "id, email, created_at, expires_at";

export async function readWorkspace(client: Client, orgId: string): Promise<Workspace | null> {
  const { data, error } = await client
    .from("orgs")
    .select("name, self_registered")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return { name: data.name, selfRegistered: data.self_registered };
}

/**
 * `orgs.founder_id`: the teacher who made the workspace, and the only one who may remove a
 * colleague (migration 20261011000000). Null for the shared workspace, for a workspace whose
 * founder's account is gone, and whenever the read fails. That last case includes a database the
 * migration has not reached, where the column does not exist: the page then marks no founder and
 * offers no Remove, which is how it stood before. A read of its own, so that such a database
 * still answers `readWorkspace`.
 */
export async function readFounderId(client: Client, orgId: string): Promise<string | null> {
  const { data, error } = await client
    .from("orgs")
    .select("founder_id")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.founder_id === "string" ? data.founder_id : null;
}

/** The instructors and admins of the caller's workspace, oldest first, or null on a failure. */
export async function listMembers(client: Client): Promise<WorkspaceMember[] | null> {
  const { data, error } = await client.rpc("org_members");
  if (error || !data) return null;
  return data.map((row) => ({
    profileId: row.profile_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

/** The workspace's open invitations, newest first, or null on a failure. */
export async function listOpenInvites(client: Client): Promise<OpenInvite[] | null> {
  const { data, error } = await client
    .from("org_invites")
    .select(OPEN_INVITE_COLUMNS)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(OPEN_INVITE_LIMIT);
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

/**
 * - an address: the invitation is open, in the caller's workspace.
 * - `accepted`: the colleague is already in.
 * - `gone`: revoked, or not an invitation the caller can see.
 * - `failed`: the read did not answer.
 */
export type FoundInvite = { email: string } | "accepted" | "gone" | "failed";

/** One invitation of the caller's own workspace, by id. Row level security hides every other. */
export async function findInvite(client: Client, inviteId: string): Promise<FoundInvite> {
  const { data, error } = await client
    .from("org_invites")
    .select("email, accepted_at, revoked_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) return "failed";
  if (!data || data.revoked_at) return "gone";
  if (data.accepted_at) return "accepted";
  return { email: data.email };
}

/**
 * How many invitations this person has made since `since`, revoked ones included, as
 * `create_org_invite` counts them. Null when the count could not be read.
 */
export async function countInvitesSince(
  client: Client,
  inviterId: string,
  since: Date,
): Promise<number | null> {
  const { count, error } = await client
    .from("org_invites")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", inviterId)
    .gt("created_at", since.toISOString());
  return error || count === null ? null : count;
}

/**
 * How many invitations the caller's own workspace has made to one address since `since`, revoked
 * ones included. Row level security keeps the count to that workspace: invitations other
 * workspaces sent the address are counted only by `create_org_invite`. Null when the count could
 * not be read.
 */
export async function countInvitesToSince(
  client: Client,
  email: string,
  since: Date,
): Promise<number | null> {
  const { count, error } = await client
    .from("org_invites")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .gt("created_at", since.toISOString());
  return error || count === null ? null : count;
}

/** `revoke_org_invite`'s three answers, and `failed` for a call that did not answer. */
export type RevokedInvite = "revoked" | "already_accepted" | "not_found" | "failed";

/** Revokes one invitation of the caller's workspace. Anything else is `not_found`. */
export async function revokeOrgInvite(client: Client, inviteId: string): Promise<RevokedInvite> {
  const { data, error } = await client.rpc("revoke_org_invite", { p_invite: inviteId });
  if (error) {
    console.error("[workspace] an invitation could not be revoked", { code: error.code });
    return "failed";
  }
  return data === "revoked" || data === "already_accepted" || data === "not_found"
    ? data
    : "failed";
}

/** Every answer of `create_org_invite` but `created`. */
export const INVITE_REFUSALS = [
  "invalid_email",
  "shared_workspace",
  "unconfirmed",
  "already_member",
  "already_invited",
  "members_full",
  "invites_full",
  "rate_limited",
  // From migration 20261010000000. Before it is applied the function never answers this.
  "recipient_limited",
] as const;

export type InviteRefusal = (typeof INVITE_REFUSALS)[number];

/**
 * `token` is the raw token. It exists in this value and in the email's link, and nowhere else:
 * whoever holds a `created` passes it to `sendWorkspaceInviteEmail` and drops it.
 */
export type CreatedInvite =
  | { status: "created"; inviteId: string; token: string }
  | { status: InviteRefusal }
  | { status: "failed" };

function isRefusal(status: unknown): status is InviteRefusal {
  return (INVITE_REFUSALS as readonly unknown[]).includes(status);
}

/**
 * Makes an invitation. `service` is the service-role client and `inviterId` the account the
 * server action has just verified: never an id the request carried.
 */
export async function createOrgInvite(
  service: Client,
  inviterId: string,
  email: string,
): Promise<CreatedInvite> {
  const { data, error } = await service.rpc("create_org_invite", {
    p_inviter: inviterId,
    p_email: email,
  });
  if (error) {
    // The code only. The message could quote the address, and nothing here may log the reply.
    console.error("[workspace] an invitation could not be made", { code: error.code });
    return { status: "failed" };
  }
  const row = Array.isArray(data) ? data[0] : undefined;
  if (row?.status === "created" && row.invite_id && row.token) {
    return { status: "created", inviteId: row.invite_id, token: row.token };
  }
  if (isRefusal(row?.status)) return { status: row.status };
  console.error("[workspace] create_org_invite gave an answer the page does not know");
  return { status: "failed" };
}

/**
 * Removes one colleague from the caller's workspace, as the caller: `remove_org_member` checks
 * that they founded it. `failed` for a call that did not answer, which includes a database
 * without migration 20261011000000.
 */
export async function removeOrgMember(client: Client, memberId: string): Promise<RemovedMember> {
  const { data, error } = await client.rpc("remove_org_member", { p_member: memberId });
  if (error) {
    console.error("[workspace] a colleague could not be removed", { code: error.code });
    return "failed";
  }
  return REMOVE_ANSWERS.find((known) => known === data) ?? "failed";
}
