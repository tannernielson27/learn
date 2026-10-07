/**
 * The welcome email for a new account (#360): "welcome, confirm your address", with what to do
 * first. Sent by the app (`sendWelcomeEmail` in src/lib/auth), not by Supabase Auth, so unlike the
 * magic link it has a plain-text part and needs no template pasted into a hosted project.
 *
 * The only dynamic value is the link, and the layout escapes it. There is no name in the greeting
 * on purpose: nothing a person typed reaches this email.
 *
 * Pure: no Next, no Supabase, no environment.
 */
import { renderEmailDocument, type EmailLayout } from "../layout";

export type WelcomeRole = "teacher" | "student";

export const WELCOME_SUBJECT = "Welcome to LeaRN: confirm your email address";

export interface RenderedWelcome {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  paragraphs: string[];
  notes: string[];
}

const HEADING = "Welcome to LeaRN";
const BUTTON = "Confirm my email address";
const FOOTER =
  "Sent by LeaRN, an NCLEX practice app, because an account was made with this address.";
const NOT_YOU = "If you did not make a LeaRN account with this address, you can ignore this email.";

const COPY: Record<WelcomeRole, Copy> = {
  student: {
    paragraphs: [
      "Your account is ready and you are in your class. One thing is left: confirm that this email address is yours, so you can get back in if you ever forget your password.",
      "What to do first: open LeaRN and start whatever your instructor has set. Your classes and assignments are on your home page. Nothing is locked while you wait to confirm.",
    ],
    notes: [
      "The link works once and expires in an hour. If it has expired, sign in and choose Send the email again on your home page.",
      NOT_YOU,
    ],
  },
  teacher: {
    paragraphs: [
      "Your account is ready. One thing is left: confirm that this email address is yours, so you can get back in if you ever forget your password.",
      "What to do first: make a class, then share its invite link or QR code with your students. Or start with an item bank and write a few questions to run live.",
    ],
    notes: [
      "The link works once and expires in an hour. If it has expired, sign in and ask for a new one.",
      NOT_YOU,
    ],
  },
};

function layoutFor(copy: Copy, link: string): EmailLayout {
  return {
    title: WELCOME_SUBJECT,
    heading: HEADING,
    paragraphs: copy.paragraphs,
    action: { label: BUTTON, href: link },
    notes: copy.notes,
    footer: FOOTER,
  };
}

function renderText(copy: Copy, link: string): string {
  return [
    HEADING,
    "",
    ...copy.paragraphs.flatMap((line) => [line, ""]),
    `${BUTTON}: ${link}`,
    "",
    ...copy.notes.flatMap((line) => [line, ""]),
    FOOTER,
    "",
  ].join("\n");
}

/** The HTML part's layout, for a preview that renders it inside a page. */
export function welcomeEmail(role: WelcomeRole, link: string): EmailLayout {
  return layoutFor(COPY[role], link);
}

/** Both parts. Throws if `link` is not an http(s) address, so a bad link is never mailed. */
export function renderWelcomeEmail(role: WelcomeRole, link: string): RenderedWelcome {
  const copy = COPY[role];
  return {
    subject: WELCOME_SUBJECT,
    html: renderEmailDocument(layoutFor(copy, link)),
    text: renderText(copy, link),
  };
}
