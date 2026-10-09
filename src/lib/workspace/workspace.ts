/**
 * A teacher's workspace page: its route, the limits it states and how it words a date. Pure: no
 * React, no Next, no Supabase. The limits are the database's (`create_org_invite`); they are
 * repeated here only to be said in sentences, never to decide anything.
 */

export const WORKSPACE_PATH = "/author/workspace";

/** Instructors and admins in one workspace. Students are not members. */
export const WORKSPACE_MEMBER_CAP = 10;

/** Pending invitations in one workspace at once. */
export const WORKSPACE_PENDING_CAP = 10;

/** Invitations one person makes in 24 hours. Revoked ones count. */
export const WORKSPACE_DAILY_INVITES = 5;

/** How long an invitation can be accepted. */
export const WORKSPACE_INVITE_DAYS = 7;

// Pinned to UTC so a date renders the same on the server and in any browser.
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** "Oct 9, 2026", or nothing for a value that is not a date. */
export function formatWorkspaceDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE.format(date);
}

/**
 * Whether an invitation nobody accepted or revoked can still be accepted. A value that is not a
 * date counts as expired: the page then offers a resend rather than promising a link that works.
 */
export function isInviteExpired(expiresAt: string, now: Date): boolean {
  const end = new Date(expiresAt).getTime();
  return Number.isNaN(end) || end <= now.getTime();
}

/** "Teacher" for an instructor: the word the rest of LeaRN uses for the people who teach. */
export function memberRoleLabel(role: string): string {
  return role === "admin" ? "Admin" : "Teacher";
}

/** "3 of 10 members". */
export function memberCountLabel(count: number): string {
  return `${count} of ${WORKSPACE_MEMBER_CAP} members`;
}
