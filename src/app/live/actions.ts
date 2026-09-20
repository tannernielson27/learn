"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { endSession, startSession } from "@/lib/supabase/sessions";

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

/** Ends a session, after which its code resolves for nobody and it cannot be reopened. */
export async function endLiveSession(sessionId: string): Promise<void> {
  if (!isUuid(sessionId)) redirect("/author");
  const { supabase } = await requireAuthor(`/live/${sessionId}`);

  const ended = await endSession(supabase, sessionId);
  if (!ended.ok) redirect(`/live/${sessionId}?ended=${ended.reason}`);

  revalidatePath(`/live/${sessionId}`);
}
