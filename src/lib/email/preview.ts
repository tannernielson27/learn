/**
 * Every message LeaRN sends, rendered with sample data for `/gallery/email` (#268). The gallery
 * is closed on production, and nothing here is real: the link host is `learn.example`, the token
 * is a made-up string, and the dates are fixed so the preview looks the same on every run.
 */
import { assignmentLink, renderReminderEmail, reminderLayout } from "@/lib/reminders/reminderEmail";
import type { ReminderContent } from "@/lib/reminders/reminderEmail";
import { renderEmailBody } from "./layout";
import { MAGIC_LINK_SUBJECT, magicLinkEmail } from "./templates/magicLink";
import { renderWelcomeEmail, welcomeEmail, type WelcomeRole } from "./templates/welcome";
import {
  renderWorkspaceInviteEmail,
  workspaceInviteEmail,
  type WorkspaceInviteContent,
} from "./templates/workspaceInvite";

export interface EmailPreview {
  id:
    | "magic-link"
    | "welcome-student"
    | "welcome-teacher"
    | "workspace-invite"
    | "reminder-opened"
    | "reminder-closing-soon";
  name: string;
  subject: string;
  /** The layout table, escaped, for rendering inside the preview page. */
  bodyHtml: string;
  /** The plain-text part, or null when the app does not control it. */
  text: string | null;
}

const ORIGIN = "https://learn.example";
const SAMPLE_SIGN_IN_LINK = `${ORIGIN}/auth/confirm?next=%2Flearn&token_hash=sample-token-hash&type=email`;

const SAMPLE_REMINDER = {
  title: "Week 5: Heart failure & fluid balance",
  className: "NURS 301 Adult Health",
  // 17:00 in Denver on Thursday, September 24, seen from the evening before.
  closesAt: "2026-09-24T23:00:00Z",
  timeZone: "America/Denver",
  link: assignmentLink(ORIGIN, "00000000-0000-4000-8000-000000000268"),
  now: new Date("2026-09-23T23:00:00Z"),
} as const;

function reminderPreview(
  id: EmailPreview["id"],
  name: string,
  kind: ReminderContent["kind"],
): EmailPreview {
  const content: ReminderContent = { ...SAMPLE_REMINDER, kind };
  const rendered = renderReminderEmail(content);
  return {
    id,
    name,
    subject: rendered.subject,
    bodyHtml: renderEmailBody(reminderLayout(content)),
    text: rendered.text,
  };
}

function welcomePreview(
  id: EmailPreview["id"],
  name: string,
  role: WelcomeRole,
  next: string,
): EmailPreview {
  const link = `${ORIGIN}/auth/confirm?next=${encodeURIComponent(next)}&token_hash=sample-token-hash&type=email`;
  const rendered = renderWelcomeEmail(role, link);
  return {
    id,
    name,
    subject: rendered.subject,
    bodyHtml: renderEmailBody(welcomeEmail(role, link)),
    text: rendered.text,
  };
}

// The name carries an ampersand and quotes, so the preview shows the escaping at work.
const SAMPLE_WORKSPACE_INVITE: WorkspaceInviteContent = {
  workspaceName: `Adult Health & "Pharm" team`,
  inviterEmail: "ada.instructor@learn.example",
  link: `${ORIGIN}/w/sample-invite-token-0123456789ab`,
};

function workspaceInvitePreview(): EmailPreview {
  const rendered = renderWorkspaceInviteEmail(SAMPLE_WORKSPACE_INVITE);
  return {
    id: "workspace-invite",
    name: "Workspace invitation",
    subject: rendered.subject,
    bodyHtml: renderEmailBody(workspaceInviteEmail(SAMPLE_WORKSPACE_INVITE)),
    text: rendered.text,
  };
}

export const EMAIL_PREVIEWS: readonly EmailPreview[] = [
  {
    id: "magic-link",
    name: "Sign-in link",
    subject: MAGIC_LINK_SUBJECT,
    bodyHtml: renderEmailBody(magicLinkEmail(SAMPLE_SIGN_IN_LINK)),
    text: null,
  },
  welcomePreview("welcome-student", "Welcome, student", "student", "/learn"),
  welcomePreview("welcome-teacher", "Welcome, teacher", "teacher", "/author"),
  workspaceInvitePreview(),
  reminderPreview("reminder-opened", "Assignment is open", "opened"),
  reminderPreview("reminder-closing-soon", "Assignment closes soon", "closing_soon"),
];
