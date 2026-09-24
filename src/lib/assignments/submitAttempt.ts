/**
 * Submitting an attempt (#208): the student's own submit, and the submit at close.
 *
 * Both score on the server through `scoreAttempt` — `scoreSubmission`, the one scoring entry point
 * (ADR 0003) — and write the total through `record_attempt_submission`, which only the service role
 * may call. Neither hands anything back to the student but "submitted": no score, no mark, no key.
 *
 * ## The student's submit
 *
 * `begin_attempt_submission` (as the student) checks the window, the membership and the rate limit
 * and hands over the saved answers with the revision they were read at. They are scored here and
 * recorded; if a save landed in between, the record is refused as `changed` and the whole thing is
 * read and scored again, a bounded number of times.
 *
 * ## The submit at close
 *
 * An attempt still open when its window closes is submitted with exactly what it saved. The
 * database cannot score, so it lists what is due (`expired_open_attempts`) and this scores and
 * records each with `automatic`. It runs when a student opens an assignment that has closed (for
 * that student and that assignment), and it is what #212's cron calls for everyone. Recording is
 * idempotent: an attempt someone else already submitted answers `already_submitted`, which counts
 * as done, so two runs racing each other score it once.
 */
import type { AttemptRefusal } from "./attemptRefusals";
import { scoreAttempt, type SetItem } from "./attemptScoring";
import type {
  AttemptCall,
  ExpiredAttempt,
  ExpiredFilter,
  RecordInput,
  SubmissionInput,
} from "@/lib/supabase/attempts";

/** What submitting needs from the database; `attemptStore` in ./attemptStore.ts is the real one. */
export interface SubmitStore {
  begin(attemptId: string): Promise<AttemptCall<SubmissionInput>>;
  items(ids: readonly string[]): Promise<SetItem[] | null>;
  record(input: RecordInput): Promise<AttemptCall<string>>;
}

/** What the submit at close needs: the list of what is due, and the same two as above. */
export interface AutoSubmitStore {
  expired(filter: ExpiredFilter): Promise<ExpiredAttempt[] | null>;
  items(ids: readonly string[]): Promise<SetItem[] | null>;
  record(input: RecordInput): Promise<AttemptCall<string>>;
}

export type SubmitOutcome = { ok: true } | { ok: false; refusal: AttemptRefusal };

/** A save racing the submit twice in a row is a student still typing; a third time is a fault. */
const MAX_TRIES = 3;

/** Scores and records the student's own submit. `studentId` is the one the server verified. */
export async function submitAttempt(
  store: SubmitStore,
  attemptId: string,
  studentId: string,
): Promise<SubmitOutcome> {
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    const begun = await store.begin(attemptId);
    if (!begun.ok) {
      // Submitted already (another tab, a double tap): the student's wish is already true.
      return begun.refusal === "already_submitted" ? { ok: true } : begun;
    }
    const set = await store.items(begun.value.itemSet);
    if (set === null) return { ok: false, refusal: "failed" };

    const recorded = await store.record({
      attemptId,
      studentId,
      revision: begun.value.revision,
      score: scoreAttempt(set, begun.value.answers),
      automatic: false,
    });
    if (recorded.ok || recorded.refusal === "already_submitted") return { ok: true };
    if (recorded.refusal !== "changed") return recorded;
  }
  return { ok: false, refusal: "changed" };
}

/**
 * Submits every attempt that is due, with what each saved, and says how many this run recorded.
 * Items are read once per assignment. An attempt that cannot be scored now (its items could not be
 * read) is left open for the next run rather than recorded wrongly.
 */
export async function autoSubmitExpired(
  store: AutoSubmitStore,
  filter: ExpiredFilter = {},
): Promise<number> {
  const due = await store.expired(filter);
  if (due === null) return 0;

  const sets = new Map<string, SetItem[] | null>();
  let recorded = 0;
  // Each attempt on its own: the list comes back in a stable order, so one that throws every time
  // would otherwise hold up every attempt behind it on every run (#212 runs this for everyone).
  for (const attempt of due) {
    try {
      if (!sets.has(attempt.assignmentId)) {
        sets.set(attempt.assignmentId, await readSet(store, attempt));
      }
      const set = sets.get(attempt.assignmentId);
      if (!set) continue;
      const result = await store.record({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        revision: attempt.revision,
        score: scoreAttempt(set, attempt.answers),
        automatic: true,
      });
      if (result.ok) recorded += 1;
    } catch (error) {
      console.error("[auto-submit] an attempt could not be submitted at close", {
        attemptId: attempt.attemptId,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return recorded;
}

/** An assignment's items, or null (skip its attempts this run) when the read throws. */
async function readSet(store: AutoSubmitStore, attempt: ExpiredAttempt): Promise<SetItem[] | null> {
  try {
    return await store.items(attempt.itemSet);
  } catch (error) {
    console.error("[auto-submit] an assignment's items could not be read", {
      assignmentId: attempt.assignmentId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
