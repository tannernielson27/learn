/**
 * The email support@ gets when someone uses "Tell us about a problem" (#568). It goes to the team,
 * never to a user: Reply-To is the sender's own address, so support answers from Zoho by replying.
 *
 * What the person typed is in it, escaped like every other string in the layout. So is what support
 * needs to find the problem: who sent it, the page, the error's reference and Sentry event id, and
 * which deployment. Nothing else from the session is attached: no answers, no join codes.
 *
 * Pure: no Next, no Supabase, no environment. The caller hands in the version and environment.
 */
import { renderEmailDocument, type EmailLayout } from "../layout";

export interface ProblemReportDetails {
  /** What the person typed, already trimmed and length-checked. */
  message: string;
  sender: { email: string; displayName: string | null; role: string | null };
  /** The page they were on, query and fragment already removed. */
  page: string;
  /** The error screen's reference (Next's digest), when they came from one. */
  reference: string | null;
  /** The Sentry event id of that error, when it was reported. */
  eventId: string | null;
  /** The deployed commit, shortened (`deployedVersion`). */
  version: string;
  /** Vercel's `VERCEL_ENV`: `production`, `preview` (staging) or `development`. */
  environment: string;
}

export interface RenderedProblemReport {
  subject: string;
  text: string;
  html: string;
}

const SUBJECT_PREVIEW = 60;
const FOOTER = "Sent by LeaRN from the Tell us about a problem form. Reply to answer the sender.";

/** The first line of the message, squeezed onto one line, for the subject. */
function preview(message: string): string {
  const line = message.split(/\r?\n/, 1)[0].replace(/\s+/g, " ").trim();
  return line.length > SUBJECT_PREVIEW ? `${line.slice(0, SUBJECT_PREVIEW - 1).trimEnd()}…` : line;
}

export function problemReportSubject(details: ProblemReportDetails): string {
  const tag = details.environment === "production" ? "" : `[${stageName(details.environment)}] `;
  return `${tag}Problem: ${preview(details.message)}`;
}

/** A preview deployment of `main` is staging; say so in the words the team uses. */
function stageName(environment: string): string {
  return environment === "preview" ? "staging" : environment;
}

function facts(details: ProblemReportDetails): string[] {
  const { sender } = details;
  return [
    `From: ${sender.displayName ? `${sender.displayName} (${sender.email})` : sender.email}`,
    `Role: ${sender.role ?? "none yet"}`,
    `Page: ${details.page}`,
    `Reference: ${details.reference ?? "none (not sent from an error screen)"}`,
    `Sentry event: ${details.eventId ?? "none"}`,
    `Version: ${details.version} (${stageName(details.environment)})`,
  ];
}

/** The HTML part's layout, for the gallery's email preview. */
export function problemReportEmail(details: ProblemReportDetails): EmailLayout {
  return {
    title: problemReportSubject(details),
    heading: "Someone told us about a problem",
    // One paragraph per line the person wrote, so their line breaks survive.
    paragraphs: details.message.split(/\r?\n/).filter((line) => line.trim() !== ""),
    notes: facts(details),
    footer: FOOTER,
  };
}

export function renderProblemReportEmail(details: ProblemReportDetails): RenderedProblemReport {
  const subject = problemReportSubject(details);
  return {
    subject,
    html: renderEmailDocument(problemReportEmail(details)),
    text: [
      "Someone told us about a problem",
      "",
      details.message,
      "",
      ...facts(details),
      "",
      FOOTER,
      "",
    ].join("\n"),
  };
}
