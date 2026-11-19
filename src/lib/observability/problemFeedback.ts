/**
 * Attaches what someone wrote in "Tell us about a problem" (#568) to Sentry as user feedback, linked
 * to the error they came from when there was one. The email to support@ is the record that matters;
 * this puts the same words next to the stack trace.
 *
 * The caller scrubs the message and the page (`sendProblemReport`), and no name or address is sent:
 * the email already says who it was, and Sentry is not where people's details belong (#235).
 *
 * Off without a DSN, loaded lazily, sent after the response and flushed: the same pattern as
 * `ceilingAlert.ts` and `cronMonitor.ts`. It never throws.
 */
import { after } from "next/server";
import { sentryDsn } from "./options";

export interface FeedbackPayload {
  message: string;
  url: string;
  associatedEventId?: string;
}

type SentryCalls = {
  captureFeedback: (feedback: FeedbackPayload & { source: string }) => unknown;
  flush: (timeout?: number) => Promise<boolean>;
};

export interface ProblemFeedbackDeps {
  dsn: () => string | undefined;
  load: () => Promise<SentryCalls>;
  defer: (task: () => Promise<void>) => void;
}

const FLUSH_TIMEOUT_MS = 2_000;
const ignore = () => undefined;

/** How Sentry lists where the feedback came from. */
export const FEEDBACK_SOURCE = "problem-form";

export function createProblemFeedback(deps: ProblemFeedbackDeps) {
  return (payload: FeedbackPayload): void => {
    try {
      if (!sentryDsn(deps.dsn())) return;
      deps.defer(() =>
        deps
          .load()
          .then((sentry) => {
            sentry.captureFeedback({ ...payload, source: FEEDBACK_SOURCE });
            return sentry.flush(FLUSH_TIMEOUT_MS);
          })
          .then(ignore, ignore),
      );
    } catch {
      // The email has gone; there is nothing left to tell the person.
    }
  };
}

function afterTheResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

export const sendProblemFeedback = createProblemFeedback({
  dsn: () => process.env.SENTRY_DSN,
  load: () => import("@sentry/nextjs"),
  defer: afterTheResponse,
});
