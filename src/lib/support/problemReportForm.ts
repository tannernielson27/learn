/**
 * What the "Tell us about a problem" form (#568) and its server action agree on: field names, the
 * message's length, the answers the action gives, and the words for each. Plain constants and
 * types, safe in the browser: no zod, no mailer (`noClientZod.test.ts`, `noClientEmail.test.ts`).
 */
import { SUPPORT_EMAIL } from "@/lib/site/links";

export const PROBLEM_FIELDS = {
  message: "message",
  page: "page",
  reference: "reference",
  eventId: "eventId",
  /** Hidden from people; a form-filling script fills it, and is then thanked and ignored. */
  trap: "website",
} as const;

export const PROBLEM_MESSAGE_MIN = 10;
export const PROBLEM_MESSAGE_MAX = 2000;

export const PROBLEM_LABEL = "Tell us about a problem";

export type ProblemReportState =
  | { status: "idle" }
  | { status: "sent"; replyTo: string }
  | { status: "signed_out" }
  | { status: "invalid"; error: string }
  | { status: "rate_limited"; error: string }
  | { status: "error"; error: string };

export const PROBLEM_IDLE: ProblemReportState = { status: "idle" };

export const PROBLEM_COPY = {
  messageTooShort: `Tell us a little more: at least ${PROBLEM_MESSAGE_MIN} characters.`,
  messageTooLong: `Keep it under ${PROBLEM_MESSAGE_MAX} characters.`,
  rateLimited: `You have sent us several already. Try again in an hour, or email ${SUPPORT_EMAIL}.`,
  failed: `It did not send. Try again, or email ${SUPPORT_EMAIL}.`,
} as const;
