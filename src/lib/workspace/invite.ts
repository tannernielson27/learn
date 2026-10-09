import { clipInviteToken } from "@/lib/classes/classes";
import type {
  CreatedInvite,
  FoundInvite,
  InviteRefusal as CreateInviteRefusal,
  RevokedInvite,
} from "@/lib/supabase/workspace";
import { parseInviteAddress } from "./inviteAddress";
import { MOVE_NOT_CONFIRMED } from "./membership";
import type { WorkspaceInvite, WorkspaceInviteEmailResult } from "./inviteEmail";
import {
  WORKSPACE_DAILY_INVITES,
  WORKSPACE_MEMBER_CAP,
  WORKSPACE_PENDING_CAP,
  WORKSPACE_RECIPIENT_DAILY_INVITES,
} from "./workspace";

/**
 * A workspace invitation, from both ends.
 *
 * First, the page the invitation opens, `/w/<token>`: its path, what it says, and the rule for
 * when accepting ends whatever access the account had before.
 *
 * Then, what the inviting teacher does on `/author/workspace`: inviting a colleague, revoking an
 * invitation and sending one again, as that page's Server Functions run them. Everything that
 * touches the database or the mailer is handed in, so the order of the steps and the sentence each
 * ending gets are tested here without either. The raw token is held between `create` and `send`
 * and goes nowhere else: no outcome carries it and no log line does.
 *
 * No React, Next or Supabase at run time: the only things taken from the Supabase layer are types.
 */

// ---------------------------------------------------------------------------
// The invitation page, /w/<token>
// ---------------------------------------------------------------------------

const PREFIX = "/w";

/** `/w/<token>`. Clipped and escaped, so a value that is not a token cannot become a path. */
export function workspaceInvitePath(token: string): string {
  return `${PREFIX}/${encodeURIComponent(clipInviteToken(token))}`;
}

/** Whether a request path is an invitation page. The token is the last segment of such a path. */
export function isWorkspaceInvitePath(pathname: string): boolean {
  return pathname.startsWith(`${PREFIX}/`);
}

/** Sign-in, coming back to the invitation afterwards. */
export function signInToAcceptPath(token: string): string {
  return `/sign-in?next=${encodeURIComponent(workspaceInvitePath(token))}`;
}

/** How many pages deep a `next` inside a `next` is followed. Sign-in to password page is two. */
const NEXT_DEPTH = 4;

/**
 * Whether a query string's `next` is an invitation page, or a page whose own `next` is one.
 * "Sign in to accept" is `/sign-in?next=/w/<token>`, so the token is in that page's address too.
 */
function nextIsWorkspaceInvite(search: string): boolean {
  let query = search;
  for (let depth = 0; depth < NEXT_DEPTH; depth += 1) {
    // `URLSearchParams` never throws: a value it cannot decode is kept as it was written.
    const next = new URLSearchParams(query).get("next");
    if (!next) return false;
    const mark = next.indexOf("?");
    if (isWorkspaceInvitePath(mark < 0 ? next : next.slice(0, mark))) return true;
    if (mark < 0) return false;
    query = next.slice(mark);
  }
  return false;
}

/**
 * The headers the proxy adds to every answer under `/w/`, and to any page it runs on whose query
 * string carries an invitation in `next` (sign-in, and wherever sign-in passes it on). The token
 * is the whole secret, so no Referer may carry it to another site.
 */
export function inviteResponseHeaders(
  pathname: string,
  search = "",
): Readonly<Record<string, string>> {
  return isWorkspaceInvitePath(pathname) || nextIsWorkspaceInvite(search)
    ? { "Referrer-Policy": "no-referrer" }
    : {};
}

/** Whether two addresses are the same one, as the database compares them. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * An address with all but its first letters hidden, for someone signed in as somebody else: enough
 * to recognise an address of your own, not enough to learn one. The hidden parts are always three
 * characters, so not even the length shows.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const ending = dot > 0 ? domain.slice(dot) : "";
  return `${[...local][0]}***@${[...domain][0] ?? ""}***${ending}`;
}

/** Who sent the invitation, as the page names them. Plain text. */
export function inviterLabel(inviter: { name: string | null; email: string | null }): string {
  const name = inviter.name?.trim();
  if (name) return name;
  return inviter.email?.trim() || "A colleague";
}

/** The four things `resolve_org_invite` says about a token that was ever issued. */
export const INVITE_STATES = ["pending", "expired", "revoked", "accepted"] as const;
export type InviteState = (typeof INVITE_STATES)[number];

/**
 * `accept_org_invite`'s refusals of the account itself, each of which the page explains.
 *
 * `already_teaches` is what the function answered every teacher before migration 20261011000000,
 * and what a database without that migration still answers. With it, a teacher is told which of
 * the four after it applies, or is asked to confirm a move.
 */
export const INVITE_REFUSALS = [
  "wrong_address",
  "student",
  "already_teaches",
  "already_member",
  "teaches_shared",
  "founder_with_members",
  "students_depend",
  "shared_workspace",
  "members_full",
] as const;
export type InviteRefusal = (typeof INVITE_REFUSALS)[number];

/**
 * One answer for a token that is missing, malformed or unknown, and for a caller the lookup has
 * stopped answering: saying which would tell a guesser which tokens exist.
 */
export const INVITE_NOT_VALID_HEADING = "This invitation is not valid or has expired";
export const INVITE_NOT_VALID_TEXT =
  "Ask the person who invited you to send a new invitation from their workspace.";

export const INVITE_CLOSED: Readonly<Record<Exclude<InviteState, "pending">, string>> = {
  expired: "This invitation has expired. Ask the person who invited you to send a new one.",
  revoked: "This invitation was withdrawn by the person who sent it.",
  accepted: "This invitation has already been used.",
};

export const INVITE_REFUSED: Readonly<Record<InviteRefusal, string>> = {
  wrong_address:
    "This invitation was sent to a different email address. Sign out, then open the link while signed in as the address it was sent to.",
  student:
    "This address is a student account, and a student account cannot become a teacher. Ask to be invited at another email address.",
  already_teaches:
    "This account already teaches in a workspace. Moving between workspaces is not available yet.",
  already_member: "This account already teaches in this workspace. There is nothing to accept.",
  teaches_shared:
    "This account teaches in the LeaRN workspace, and an account there cannot move to another one. Ask to be invited at another email address.",
  founder_with_members:
    "You started the workspace you teach in now, and other teachers are still in it. Remove them on your workspace page first, or ask to be invited at another email address.",
  students_depend:
    "You are the only teacher in the workspace you teach in now, and it still has students in a class, an assignment that has not closed or a live session that has not ended. Leaving would leave them with no teacher. Remove the students and close those first, or ask to be invited at another email address.",
  shared_workspace: "This workspace can no longer take new teachers by invitation.",
  members_full:
    "This workspace is full. Ask the person who invited you to get in touch with LeaRN.",
};

/**
 * Everything `accept_org_invite` answers, and `unavailable` for a database that did not.
 * `move_needs_confirmation`: the account teaches elsewhere, may move, and has not said it will.
 */
export type AcceptInviteResult =
  | "accepted"
  | "invalid"
  | "already_accepted"
  | "revoked"
  | "expired"
  | InviteRefusal
  | "move_needs_confirmation"
  | "unavailable";

/** What an invitation page shows in place of its form once the server has answered. */
export type InviteAnswer =
  | { status: "invalid" }
  | { status: "closed"; state: Exclude<InviteState, "pending"> }
  | { status: "refused"; reason: InviteRefusal }
  | { status: "error"; error: string };

/** The "Join workspace" button's state. On success the action redirects. */
export type JoinWorkspaceState = { status: "idle" } | InviteAnswer;

/** The new-account form's state. On success the action redirects. */
export type InviteAccountState =
  | { status: "idle" }
  | Exclude<InviteAnswer, { status: "error" }>
  | { status: "error"; error: string; field: "displayName" | "password" | null }
  /** The invited address already has an account: sign in to it, then accept. */
  | { status: "exists" }
  /** The account was made and is in the workspace, but this browser could not be signed in. */
  | { status: "created_signed_out" };

export const INVITE_CLOSED_HEADING = "This invitation can no longer be used";
export const INVITE_REFUSED_HEADING = "This account cannot accept the invitation";

/** What to show for any answer of `accept_org_invite` but `accepted`. */
export function inviteAnswerFor(result: Exclude<AcceptInviteResult, "accepted">): InviteAnswer {
  switch (result) {
    case "invalid":
      return { status: "invalid" };
    case "already_accepted":
      return { status: "closed", state: "accepted" };
    case "revoked":
    case "expired":
      return { status: "closed", state: result };
    case "unavailable":
      return { status: "error", error: INVITE_UNAVAILABLE };
    case "move_needs_confirmation":
      // The form that asks is still on the page: the sentence goes beside its box.
      return { status: "error", error: MOVE_NOT_CONFIRMED };
    default:
      return { status: "refused", reason: result };
  }
}

/** The database could not answer. Says nothing about the token. */
export const INVITE_UNAVAILABLE = "Invitations are not working just now. Try again in a moment.";

/** `supabase/migrations/20261009010000_workspace_invites.sql`: `expires_at` is seven days on. */
export const ORG_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionClaims {
  amr?: unknown;
  [claim: string]: unknown;
}

/**
 * When this session last proved who it is, in milliseconds, or null when the token does not say.
 * Supabase Auth lists each proof in `amr` with the second it was made; the latest is taken, so
 * anything added later can only make a session look newer, never older.
 */
export function sessionStartedAt(claims: SessionClaims | null | undefined): number | null {
  const entries = claims?.amr;
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let latest = 0;
  for (const entry of entries) {
    const seconds = (entry as { timestamp?: unknown } | null)?.timestamp;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
    latest = Math.max(latest, seconds * 1000);
  }
  return latest;
}

export interface EarlierAccessQuestion {
  /** `learn_email_unconfirmed` on the account as stored, read before it is cleared. */
  wasUnconfirmed: boolean;
  /** The verified claims of the session that is accepting. */
  claims: SessionClaims | null | undefined;
  /** `resolve_org_invite`'s `expires_at` for this invitation. */
  inviteExpiresAt: string;
}

/**
 * Whether accepting must end the access an existing account had before (see `acceptAsSignedIn`).
 *
 * Yes when nobody had shown the address was theirs. Yes, too, unless this browser was signed in to
 * the account before the invitation existed: a session that old cannot have been made in answer
 * to the link, and any session newer than the invitation is treated as made during this visit.
 * Whatever cannot be read (no `amr`, an odd expiry) counts as newer, so a doubt ends access rather
 * than leaving it.
 */
export function mustEndEarlierAccess(question: EarlierAccessQuestion): boolean {
  if (question.wasUnconfirmed) return true;
  const expiresAt = Date.parse(question.inviteExpiresAt);
  const startedAt = sessionStartedAt(question.claims);
  if (!Number.isFinite(expiresAt) || startedAt === null) return true;
  return startedAt >= expiresAt - ORG_INVITE_LIFETIME_MS;
}

// ---------------------------------------------------------------------------
// The inviting teacher's side, /author/workspace
// ---------------------------------------------------------------------------

/** What an action tells the teacher. A failure is a plain sentence, never the database's text. */
export type InviteOutcome = { ok: true; email: string } | { ok: false; message: string };

export type RevokeOutcome = { ok: true } | { ok: false; message: string };

/** The signed-in teacher, as the server verified them, and the workspace they are in. */
export interface Inviter {
  id: string;
  email: string;
  workspaceName: string;
}

export interface InviteDeps {
  /** `create_org_invite` as the service role, for the verified inviter. */
  create(inviterId: string, email: string): Promise<CreatedInvite>;
  /** `revoke_org_invite` as the signed-in teacher. */
  revoke(inviteId: string): Promise<RevokedInvite>;
  /** `sendWorkspaceInviteEmail`. The only place the token goes. */
  send(invite: WorkspaceInvite): Promise<WorkspaceInviteEmailResult>;
}

export interface ResendDeps extends InviteDeps {
  /** The invitation, read from the teacher's own workspace by id. */
  find(inviteId: string): Promise<FoundInvite>;
  /** The inviter's invitations since a moment, as `create_org_invite` counts them. */
  recentCount(inviterId: string, since: Date): Promise<number | null>;
  /**
   * The invitations this workspace has made to one address since a moment. `create_org_invite`
   * counts every workspace's; the teacher's own client sees only their own.
   */
  recipientCount(email: string, since: Date): Promise<number | null>;
  now(): Date;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/** One sentence for each refusal of `create_org_invite`. */
export const INVITE_REFUSAL_MESSAGES: Record<CreateInviteRefusal, string> = {
  invalid_email: "Enter one email address for your colleague, like name@school.edu.",
  shared_workspace: "Inviting colleagues is not available in this workspace.",
  unconfirmed:
    "Confirm your own email address before you invite anyone. Open the link in the email LeaRN sent you, or ask for a new one from your item banks page.",
  already_member: "That address already belongs to a member of this workspace.",
  already_invited:
    "That address already has a pending invitation. Resend or revoke it in the list below.",
  members_full: `This workspace has ${WORKSPACE_MEMBER_CAP} members, the most it can hold.`,
  invites_full: `This workspace has ${WORKSPACE_PENDING_CAP} pending invitations, the most it can hold at once. Revoke one to send another.`,
  rate_limited: `You have sent ${WORKSPACE_DAILY_INVITES} invitations in the last 24 hours. Try again tomorrow.`,
  recipient_limited:
    "This address has been invited too many times in the last 24 hours. Try again tomorrow.",
};

export const INVITE_NOT_MADE = "The invitation could not be made just now. Try again in a moment.";

/** Why no email went out, and when trying again could work. */
const NOT_SENT: Record<
  Exclude<WorkspaceInviteEmailResult, "sent">,
  [why: string, retry: string]
> = {
  rate_limited: [
    `You have sent ${WORKSPACE_DAILY_INVITES} invitation emails today, so this one was not sent.`,
    "Try again tomorrow.",
  ],
  ceiling: [
    "LeaRN has sent as many invitation emails as it sends in an hour, so this one was not sent.",
    "Try again in an hour.",
  ],
  failed: ["The invitation email could not be sent.", "Try again in a moment."],
};

const NOTHING_PENDING = "No invitation is pending for that address.";
const LEFT_PENDING =
  "An invitation is still listed below with no email behind it. Revoke it before you try again.";

/** What the teacher reads when the email did not go out, by whether the invitation was undone. */
export function notSentMessage(
  result: Exclude<WorkspaceInviteEmailResult, "sent">,
  withdrawn: boolean,
): string {
  const [why, retry] = NOT_SENT[result] ?? NOT_SENT.failed;
  return `${why} ${withdrawn ? NOTHING_PENDING : LEFT_PENDING} ${retry}`;
}

export const INVITE_GONE = "That invitation is no longer pending. Reload the page to see the list.";
export const INVITE_ACCEPTED =
  "Your colleague has already accepted that invitation. Reload the page to see them in Members.";
export const REVOKE_FAILED = "Could not revoke the invitation. Try again.";
export const RESEND_FAILED = "Could not resend the invitation. Nothing was changed. Try again.";
export const RESEND_AT_LIMIT = `You have sent ${WORKSPACE_DAILY_INVITES} invitations in the last 24 hours, so this one was not resent. The earlier invitation is unchanged.`;
export const RESEND_RECIPIENT_LIMIT =
  "This address has been invited too many times in the last 24 hours, so this invitation was not resent. The earlier invitation is unchanged.";
export const RESEND_BAD_ADDRESS =
  "That address cannot be emailed. Revoke the invitation and invite your colleague again.";
export const EARLIER_REVOKED = "The earlier invitation was revoked, and a new one was not sent.";

/**
 * A dependency that throws is a failure like any other. Only the error's name is logged: its
 * message could carry an address or the token.
 */
async function attempt<T>(step: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[workspace] ${step} threw`, {
      name: error instanceof Error ? error.name : "unknown",
    });
    return fallback;
  }
}

/**
 * Makes an invitation and emails it. If the email does not go out, the invitation just made is
 * revoked, so no address is left holding an invitation nobody was told about; if even that fails,
 * the sentence says the invitation is still listed.
 *
 * `email` has already passed `parseInviteAddress`.
 */
export async function sendInvitation(
  inviter: Inviter,
  email: string,
  deps: InviteDeps,
): Promise<InviteOutcome> {
  const created = await attempt<CreatedInvite>(
    "making an invitation",
    () => deps.create(inviter.id, email),
    { status: "failed" },
  );
  if (created.status === "failed") return { ok: false, message: INVITE_NOT_MADE };
  if (created.status !== "created") {
    return { ok: false, message: INVITE_REFUSAL_MESSAGES[created.status] };
  }

  const sent = await attempt<WorkspaceInviteEmailResult>(
    "sending an invitation",
    () =>
      deps.send({
        inviteId: created.inviteId,
        token: created.token,
        to: email,
        inviterId: inviter.id,
        inviterEmail: inviter.email,
        workspaceName: inviter.workspaceName,
      }),
    "failed",
  );
  if (sent === "sent") return { ok: true, email };

  const revoked = await attempt<RevokedInvite>(
    "withdrawing an unsent invitation",
    () => deps.revoke(created.inviteId),
    "failed",
  );
  return { ok: false, message: notSentMessage(sent, revoked === "revoked") };
}

/** Revokes one invitation. An id that is not one of the workspace's is simply not found. */
export async function revokeInvitation(
  inviteId: string,
  deps: Pick<InviteDeps, "revoke">,
): Promise<RevokeOutcome> {
  const revoked = await attempt<RevokedInvite>(
    "revoking an invitation",
    () => deps.revoke(inviteId),
    "failed",
  );
  if (revoked === "revoked") return { ok: true };
  if (revoked === "already_accepted") return { ok: false, message: INVITE_ACCEPTED };
  if (revoked === "not_found") return { ok: false, message: INVITE_GONE };
  return { ok: false, message: REVOKE_FAILED };
}

/**
 * Sends an invitation again. The database keeps only the token's hash, so the first link cannot
 * be mailed twice: the earlier invitation is revoked and a new one made for the same address,
 * which counts toward the inviter's five a day like any other.
 *
 * The counts are read first. A teacher already at five, or an address already at its three, would
 * otherwise lose the invitation they have and get nothing in its place; `create_org_invite` still
 * has the last word.
 */
export async function resendInvitation(
  inviter: Inviter,
  inviteId: string,
  deps: ResendDeps,
): Promise<InviteOutcome> {
  const found = await attempt<FoundInvite>(
    "reading an invitation",
    () => deps.find(inviteId),
    "failed",
  );
  if (found === "failed") return { ok: false, message: RESEND_FAILED };
  if (found === "gone") return { ok: false, message: INVITE_GONE };
  if (found === "accepted") return { ok: false, message: INVITE_ACCEPTED };

  // The stored address is checked like a typed one before it is printed in another email.
  const address = parseInviteAddress(found.email);
  if (!address.ok) return { ok: false, message: RESEND_BAD_ADDRESS };

  const since = new Date(deps.now().getTime() - ONE_DAY);
  const recent = await attempt<number | null>(
    "counting invitations",
    () => deps.recentCount(inviter.id, since),
    null,
  );
  if (recent === null) return { ok: false, message: RESEND_FAILED };
  if (recent >= WORKSPACE_DAILY_INVITES) return { ok: false, message: RESEND_AT_LIMIT };

  // The same for the address's three a day. Only this workspace's invitations can be counted
  // here; if other workspaces filled the three, `create_org_invite` refuses after the revoke.
  const received = await attempt<number | null>(
    "counting an address's invitations",
    () => deps.recipientCount(address.email, since),
    null,
  );
  if (received === null) return { ok: false, message: RESEND_FAILED };
  if (received >= WORKSPACE_RECIPIENT_DAILY_INVITES) {
    return { ok: false, message: RESEND_RECIPIENT_LIMIT };
  }

  const revoked = await attempt<RevokedInvite>(
    "revoking an invitation",
    () => deps.revoke(inviteId),
    "failed",
  );
  if (revoked === "already_accepted") return { ok: false, message: INVITE_ACCEPTED };
  if (revoked === "not_found") return { ok: false, message: INVITE_GONE };
  if (revoked !== "revoked") return { ok: false, message: RESEND_FAILED };

  const outcome = await sendInvitation(inviter, address.email, deps);
  if (outcome.ok) return outcome;
  return { ok: false, message: `${EARLIER_REVOKED} ${outcome.message}` };
}
