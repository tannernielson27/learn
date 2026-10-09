/**
 * The email that invites a colleague into a teacher's workspace (owner decisions 2026-10-08).
 * Sent by the app (`sendWorkspaceInviteEmail` in src/lib/workspace), never by Supabase Auth.
 *
 * Two values in it come from people: the workspace's name, which its teacher chose, and the
 * inviter's address. Both go through the layout's escaping, both are put on one line and clipped,
 * and neither is in the subject line, so the line a stranger reads first in their inbox is always
 * LeaRN's own words. There is no free-text message, on purpose: an invitation is not a way to
 * write to an address through LeaRN.
 *
 * Pure: no Next, no Supabase, no environment.
 */
import { renderEmailDocument, type EmailLayout } from "../layout";

export const WORKSPACE_INVITE_SUBJECT = "You are invited to teach in a LeaRN workspace";

export interface WorkspaceInviteContent {
  /** `orgs.name`, as its teacher typed it. */
  workspaceName: string;
  /** The inviter's own sign-in address. */
  inviterEmail: string;
  /** `/w/<token>` on the site's canonical origin. */
  link: string;
}

export interface RenderedWorkspaceInvite {
  subject: string;
  text: string;
  html: string;
}

const HEADING = "You are invited to a LeaRN workspace";
const BUTTON = "Accept the invitation";
const FOOTER =
  "Sent by LeaRN, an NCLEX practice app, because a teacher invited this address to their workspace.";
const NOTES = [
  "The invitation is only for this email address and expires in 7 days. Sign in or make an account with this address to accept it.",
  "An account that is already a student cannot accept it. One that already teaches in LeaRN is asked first, because accepting means leaving the workspace it teaches in.",
  "If you do not know the sender, you can ignore this email. Nothing happens unless you accept.",
] as const;

/** A workspace name is at most 120 characters in the database; an address at most 254. */
const NAME_LIMIT = 120;
const ADDRESS_LIMIT = 254;

/** One line, trimmed, and no longer than `limit`: white space and control characters collapse. */
function oneLine(value: string, limit: number): string {
  const flat = value.replace(/[\s\p{Cc}]+/gu, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}...` : flat;
}

function paragraphsFor(content: WorkspaceInviteContent): string[] {
  const inviter = oneLine(content.inviterEmail, ADDRESS_LIMIT);
  const workspace = oneLine(content.workspaceName, NAME_LIMIT);
  return [
    `${inviter} invited you to teach with them in the workspace "${workspace}" on LeaRN, an NCLEX practice app.`,
    "Accepting makes you an instructor in that workspace: you share its item banks, classes and results.",
  ];
}

function layoutFor(content: WorkspaceInviteContent): EmailLayout {
  return {
    title: WORKSPACE_INVITE_SUBJECT,
    heading: HEADING,
    paragraphs: paragraphsFor(content),
    action: { label: BUTTON, href: content.link },
    notes: NOTES,
    footer: FOOTER,
  };
}

function renderText(content: WorkspaceInviteContent): string {
  return [
    HEADING,
    "",
    ...paragraphsFor(content).flatMap((line) => [line, ""]),
    `${BUTTON}: ${content.link}`,
    "",
    ...NOTES.flatMap((line) => [line, ""]),
    FOOTER,
    "",
  ].join("\n");
}

/** The HTML part's layout, for a preview that renders it inside a page. */
export function workspaceInviteEmail(content: WorkspaceInviteContent): EmailLayout {
  return layoutFor(content);
}

/** Both parts. Throws if `link` is not an http(s) address, so a bad link is never mailed. */
export function renderWorkspaceInviteEmail(
  content: WorkspaceInviteContent,
): RenderedWorkspaceInvite {
  return {
    subject: WORKSPACE_INVITE_SUBJECT,
    html: renderEmailDocument(layoutFor(content)),
    text: renderText(content),
  };
}
