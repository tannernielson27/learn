"use server";

import { redirect } from "next/navigation";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { startSession } from "@/lib/supabase/sessions";

/**
 * Starts a live session from a bank and opens its console. Every check that matters is the
 * database's: `start_session` runs as the caller, so row level security decides whether the bank
 * is theirs and the host policy decides whether the row may be written. requireAuthor is here so
 * a signed-out POST is sent to sign in rather than to a refusal from Postgres.
 */
export async function startLiveSession(bankId: string): Promise<never> {
  if (!isUuid(bankId)) redirect("/author");
  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);

  const started = await startSession(supabase, { kind: "bank", id: bankId });
  if (!started.ok) redirect(`/author/banks/${bankId}?live=${started.reason}`);

  redirect(`/live/${started.sessionId}`);
}

/**
 * Starts a live session from a case study and opens its console (#184): the six steps, in order,
 * with the patient record snapshotted beside them. The same shape as `startLiveSession` and for
 * the same reasons — `start_session` refuses a case study that is not published or has a step in
 * draft, and row level security refuses one in another org.
 */
export async function startCaseStudyLiveSession(caseStudyId: string): Promise<never> {
  if (!isUuid(caseStudyId)) redirect("/author");
  const back = `/author/case-studies/${caseStudyId}`;
  const { supabase } = await requireAuthor(back);

  const started = await startSession(supabase, { kind: "case_study", id: caseStudyId });
  if (!started.ok) redirect(`${back}?live=${started.reason}`);

  redirect(`/live/${started.sessionId}`);
}

/**
 * Ending a session is no longer a Server Function. #132 made the console a live connection, and
 * `LiveHostTransport.end()` is the move it makes — the same path `start`, `advance`, `reveal` and
 * `pause` take, guarded once by `applyHostCommand` and once by #128's trigger. A second way to end
 * a room would be a second place for the two to disagree. See `src/components/live/HostLobby.tsx`.
 */
