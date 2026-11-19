/**
 * "Tell us about a problem" (#568): a signed-in person writes what went wrong, and support@ gets an
 * email it can answer by replying. When they came from an error screen, the message is also attached
 * to that error in Sentry, so the report and the stack trace sit together.
 *
 * Server only, and every outside call is handed in, so each answer below has a test:
 *
 * 1. Signed out: nothing is read or sent. The form offers the support address instead.
 * 2. The hidden trap field is filled: a script, not a person. It is thanked and nothing is sent.
 * 3. The fields are checked. Only the message can be wrong in a way the person can fix.
 * 4. The account's limit, then the deployment's, is taken (`problemReportLimit.ts`).
 * 5. The email goes to support@ with Reply-To set to the sender's own address.
 * 6. Sentry feedback, scrubbed, with no name or address: the email already says who it was.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Mailer } from "@/lib/email";
import { renderProblemReportEmail } from "@/lib/email/templates/problemReport";
import { deployedVersion } from "@/lib/golive/healthReport";
import { scrubString, scrubUrl } from "@/lib/observability/scrub";
import { SUPPORT_EMAIL } from "@/lib/site/links";
import type { ProblemReportLimiter } from "./problemReportLimit";
import {
  PROBLEM_COPY,
  PROBLEM_FIELDS,
  PROBLEM_MESSAGE_MAX,
  PROBLEM_MESSAGE_MIN,
  type ProblemReportState,
} from "./problemReportForm";

export type ProblemSender =
  | { status: "signed_out" }
  | {
      status: "signed_in";
      userId: string;
      email: string;
      role: string | null;
      displayName: string | null;
    };

export interface ProblemFeedback {
  message: string;
  url: string;
  associatedEventId?: string;
}

export interface ProblemReportDeps {
  viewer: () => Promise<ProblemSender>;
  mailer: () => Mailer;
  limiter: ProblemReportLimiter;
  /** Sends Sentry feedback after the response; does nothing without a DSN. Never throws. */
  feedback: (feedback: ProblemFeedback) => void;
  env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_SHA?: string };
  newId?: () => string;
}

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

/** Empty means "not sent"; anything else must have the shape the page could have given it. */
const optional = (shape: RegExp) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || shape.test(value));

const fieldsSchema = z.object({
  message: z.string().trim(),
  // A path on this site, as `usePathname` gives it. Never a whole URL.
  page: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^\s]*$/),
  // Next's digest is digits; allow a little more so a change in its shape does not drop a report.
  reference: optional(/^[\w-]{1,64}$/),
  // Sentry event ids are 32 lower-case hex characters.
  eventId: optional(/^[0-9a-f]{32}$/),
});

function readFields(formData: FormData) {
  return fieldsSchema.safeParse({
    message: text(formData.get(PROBLEM_FIELDS.message)),
    page: text(formData.get(PROBLEM_FIELDS.page)),
    reference: text(formData.get(PROBLEM_FIELDS.reference)),
    eventId: text(formData.get(PROBLEM_FIELDS.eventId)),
  });
}

export async function sendProblemReport(
  formData: FormData,
  deps: ProblemReportDeps,
): Promise<ProblemReportState> {
  const viewer = await deps.viewer();
  if (viewer.status !== "signed_in") return { status: "signed_out" };
  if (text(formData.get(PROBLEM_FIELDS.trap)).trim() !== "") {
    return { status: "sent", replyTo: viewer.email };
  }

  const parsed = readFields(formData);
  // The hidden fields come from the page, not the person; one that is wrong was tampered with.
  if (!parsed.success) return { status: "error", error: PROBLEM_COPY.failed };
  const { message, page, reference, eventId } = parsed.data;
  if (message.length < PROBLEM_MESSAGE_MIN) {
    return { status: "invalid", error: PROBLEM_COPY.messageTooShort };
  }
  if (message.length > PROBLEM_MESSAGE_MAX) {
    return { status: "invalid", error: PROBLEM_COPY.messageTooLong };
  }

  const allowance = await deps.limiter.take(viewer.userId);
  if (allowance === "rate_limited")
    return { status: "rate_limited", error: PROBLEM_COPY.rateLimited };
  if (allowance === "unavailable") return { status: "error", error: PROBLEM_COPY.failed };

  const path = scrubUrl(page);
  const email = renderProblemReportEmail({
    message,
    sender: { email: viewer.email, displayName: viewer.displayName, role: viewer.role },
    page: path,
    reference,
    eventId,
    version: deployedVersion(deps.env.VERCEL_GIT_COMMIT_SHA),
    environment: deps.env.VERCEL_ENV || "development",
  });
  try {
    await deps.mailer().send({
      to: SUPPORT_EMAIL,
      replyTo: viewer.email,
      ...email,
      // What the message is about, never an address (types.ts).
      idempotencyKey: `problem-report:${viewer.userId}:${(deps.newId ?? randomUUID)()}`,
    });
  } catch (error) {
    console.error("[problem-report] the email to support could not be sent", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { status: "error", error: PROBLEM_COPY.failed };
  }

  deps.feedback({
    message: scrubString(message),
    url: path,
    ...(eventId ? { associatedEventId: eventId } : {}),
  });
  return { status: "sent", replyTo: viewer.email };
}
