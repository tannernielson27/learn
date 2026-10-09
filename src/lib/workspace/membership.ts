/**
 * Changes to who teaches in a workspace (ADR 0011, migration 20261011000000): a founder removing
 * a colleague on `/author/workspace`, and what the invitation page says to a teacher whose
 * accepting would move them out of the workspace they are in.
 *
 * Pure: no React, no Next, no Supabase. The rules are the database's (`remove_org_member`,
 * `accept_org_invite`); what is here is the sentence each answer gets.
 */

// ---------------------------------------------------------------------------
// Removing a colleague
// ---------------------------------------------------------------------------

/** `remove_org_member`'s six answers, and `failed` for a call that did not answer. */
export const REMOVE_ANSWERS = [
  "removed",
  "shared_workspace",
  "not_founder",
  "is_founder",
  "not_found",
  "is_admin",
] as const;
export type RemovedMember = (typeof REMOVE_ANSWERS)[number] | "failed";

export type RemoveOutcome = { ok: true } | { ok: false; message: string };

export const REMOVE_FAILED = "Could not remove your colleague. Nothing was changed. Try again.";

/** One sentence for each answer of `remove_org_member` that is not `removed`. */
export const REMOVE_REFUSED: Readonly<Record<Exclude<RemovedMember, "removed">, string>> = {
  shared_workspace: "Removing a colleague is not available in this workspace.",
  not_founder: "Only the person who started this workspace can remove a colleague.",
  is_founder: "The person who started a workspace cannot be removed from it.",
  not_found:
    "That person is no longer a member of this workspace. Reload the page to see the list.",
  is_admin: "An admin of a workspace cannot be removed here. Get in touch with LeaRN.",
  failed: REMOVE_FAILED,
};

/** What the founder reads before they confirm. `name` is the colleague's own words: text only. */
export function removeWarning(name: string): string {
  return `${name} loses access to this workspace at once: every bank, class, assignment and result in it. Everything they made here stays here. They keep their account and start again in a new, empty workspace of their own. Any live session they are running ends now. Invitations they sent that nobody has accepted are revoked, and so is any still waiting for them. They are signed out everywhere and sign in again with the password they have. Any teacher still in this workspace can invite them back.`;
}

export interface RemoveDeps {
  /** `remove_org_member` as the signed-in teacher. */
  remove(memberId: string): Promise<RemovedMember>;
}

/**
 * Removes one colleague. The database decides who may and whom; a dependency that throws is a
 * failure like any other, and only the error's name is logged.
 */
export async function removeColleague(memberId: string, deps: RemoveDeps): Promise<RemoveOutcome> {
  let answer: RemovedMember;
  try {
    answer = await deps.remove(memberId);
  } catch (error) {
    console.error("[workspace] removing a colleague threw", {
      name: error instanceof Error ? error.name : "unknown",
    });
    answer = "failed";
  }
  if (answer === "removed") return { ok: true };
  return { ok: false, message: REMOVE_REFUSED[answer] ?? REMOVE_FAILED };
}

// ---------------------------------------------------------------------------
// Moving to another workspace by accepting an invitation
// ---------------------------------------------------------------------------

/** What accepting would cost a teacher, from `org_invite_move_preview`. */
export interface MovePreview {
  /** The workspace they would leave, as its founder named it. Text only. */
  leavingWorkspace: string;
  /** That workspace's id. Posted back with the confirmation, which counts only for it. */
  leavingWorkspaceId: string;
  bankCount: number;
  classCount: number;
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "3 item banks and 1 class". */
export function moveLossCounts(preview: Pick<MovePreview, "bankCount" | "classCount">): string {
  return `${counted(preview.bankCount, "item bank", "item banks")} and ${counted(preview.classCount, "class", "classes")}`;
}

/** What the page says above the box a moving teacher must tick. */
export function moveWarning(preview: MovePreview): string {
  return `You teach in ${preview.leavingWorkspace} now. An account teaches in one workspace at a time, so joining means leaving it: you lose access to its ${moveLossCounts(preview)}, and to everything else in it. Nothing is deleted, and nothing comes with you.`;
}

/** The label of that box. It names the workspace, so ticking it is not ticking "I agree". */
export function moveConfirmLabel(preview: Pick<MovePreview, "leavingWorkspace">): string {
  return `I understand that I will leave ${preview.leavingWorkspace} and lose access to everything in it.`;
}

/** The name of the box in the form the page posts. */
export const MOVE_CONFIRM_FIELD = "confirmMove";

/** The name of the hidden field that carries the id of the workspace the page named. */
export const MOVE_LEAVING_FIELD = "leaving";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A confirmed move: the person ticked the box, for the workspace with this id. */
export interface ConfirmedMove {
  leaving: string;
}

/**
 * What the posted form confirms: the workspace it names, when the box is ticked and the form
 * carries that workspace's id; otherwise null. The database has the last word on both: it moves
 * nobody unless the id is the workspace the account teaches in at that moment.
 */
export function moveConfirmed(formData: FormData): ConfirmedMove | null {
  if (formData.get(MOVE_CONFIRM_FIELD) !== "on") return null;
  const leaving = formData.get(MOVE_LEAVING_FIELD);
  return typeof leaving === "string" && UUID.test(leaving) ? { leaving } : null;
}

/** The database's answer when a teacher's accept arrives without the confirmation. */
export const MOVE_NOT_CONFIRMED =
  "Joining would move this account out of the workspace it teaches in now. Reload the page, read what that means and tick the box to confirm.";

/** One line for the server log when a membership changes. Ids only: no name and no address. */
export function logMembershipChange(
  event: "member_removed" | "teacher_moved",
  ids: { actor: string; target: string; org: string },
): void {
  console.info(`[workspace] ${event}`, { actor: ids.actor, target: ids.target, org: ids.org });
}
