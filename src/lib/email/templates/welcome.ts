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

/**
 * `newcomer` (#361) is an account from open sign-up that has no role yet: someone who signed up as
 * a student and has not joined a class.
 */
export type WelcomeRole = "teacher" | "student" | "newcomer";

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
const CONFIRM =
  "Confirm that this email address is yours, so you can get back in if you forget your password.";
/** Both homes, the teacher's and the student's, carry the banner with this button. */
const SEND_AGAIN =
  "The link works once and expires in an hour. If it has expired, sign in and press Send the email again.";

const COPY: Record<WelcomeRole, Copy> = {
  student: {
    paragraphs: [
      `Your account is ready and you are in your class. ${CONFIRM}`,
      "Your classes and assignments are on your home page. Nothing is locked while you wait to confirm.",
    ],
    notes: [SEND_AGAIN, NOT_YOU],
  },
  teacher: {
    paragraphs: [
      `Your account is ready. ${CONFIRM}`,
      "To start, create a quiz or import the sample. Then create a class and share its invite link.",
    ],
    notes: [SEND_AGAIN, NOT_YOU],
  },
  newcomer: {
    paragraphs: [
      `Your account is ready. ${CONFIRM}`,
      "To start, join your class: open your teacher’s invite link while you are signed in. Nothing is locked while you wait to confirm.",
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
