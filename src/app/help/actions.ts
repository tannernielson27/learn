"use server";

import { getMailer } from "@/lib/email";
import { readViewer } from "@/lib/classes/viewer";
import { sendProblemFeedback } from "@/lib/observability/problemFeedback";
import type { ProblemReportState } from "@/lib/support/problemReportForm";
import { sharedProblemReportLimiter } from "@/lib/support/problemReportLimit";
import { sendProblemReport, type ProblemSender } from "@/lib/support/sendProblemReport";

/** Only what the email needs from the viewer; the Supabase client stays here. */
async function sender(): Promise<ProblemSender> {
  const viewer = await readViewer();
  if (viewer.status !== "signed_in") return { status: "signed_out" };
  const { userId, email, role, displayName } = viewer;
  return { status: "signed_in", userId, email, role, displayName };
}

/**
 * "Tell us about a problem" (#568), from an error screen, an account menu or the help page. It
 * lives with the help pages because that is the one public place it is offered. See
 * `sendProblemReport` for what it checks and in what order.
 */
export async function submitProblemReport(
  _previous: ProblemReportState,
  formData: FormData,
): Promise<ProblemReportState> {
  return sendProblemReport(formData, {
    viewer: sender,
    mailer: getMailer,
    limiter: sharedProblemReportLimiter(),
    feedback: sendProblemFeedback,
    env: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    },
  });
}

/**
 * Whether the form can be offered here. The help pages and the root error screen are public and
 * read no session, so they ask when the person opens the form. Only a yes or no leaves.
 */
export async function canSendProblemReport(): Promise<boolean> {
  try {
    return (await readViewer()).status === "signed_in";
  } catch {
    return false;
  }
}
