import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * "Practise the N I missed" (20261023020000_practice_missed.sql). Service role only: each call
 * takes the student the server verified, and the database checks that the source is open to them
 * and that every named question was missed there, refusing the whole request otherwise.
 */

type Client = SupabaseClient<Database>;

export type MissedStartRefusal = "not_found" | "invalid" | "empty" | "failed";

export type MissedStart = { ok: true; runId: string } | { ok: false; reason: MissedStartRefusal };

const REFUSALS: readonly MissedStartRefusal[] = ["not_found", "invalid", "empty"];

function startOutcome(data: unknown, error: unknown): MissedStart {
  if (error || !Array.isArray(data)) return { ok: false, reason: "failed" };
  const row = data[0] as { outcome?: unknown; run_id?: unknown } | undefined;
  if (row?.outcome === "started" && typeof row.run_id === "string") {
    return { ok: true, runId: row.run_id };
  }
  const refusal = REFUSALS.find((each) => each === row?.outcome);
  return { ok: false, reason: refusal ?? "failed" };
}

export async function startMissedFromRun(
  service: Client,
  student: string,
  sourceRunId: string,
  itemIds: readonly string[],
): Promise<MissedStart> {
  const { data, error } = await service.rpc("start_missed_practice_from_run", {
    student,
    source: sourceRunId,
    target_items: [...itemIds],
  });
  return startOutcome(data, error);
}

export async function startMissedFromAssignment(
  service: Client,
  student: string,
  assignmentId: string,
  itemIds: readonly string[],
  bestAttemptId: string | null,
): Promise<MissedStart> {
  const { data, error } = await service.rpc("start_missed_practice_from_assignment", {
    student,
    target_assignment: assignmentId,
    target_items: [...itemIds],
    ...(bestAttemptId === null ? {} : { best_attempt: bestAttemptId }),
  });
  return startOutcome(data, error);
}

/** Where a missed run came from: a practice run of a quiz, or an assignment's results. */
export type MissedSource =
  { kind: "practice"; bankId: string } | { kind: "assignment"; id: string };

export interface MissedRunHeader {
  runId: string;
  bankId: string;
  /** The assignment's title, or the quiz's name. */
  title: string;
  seed: string;
  source: MissedSource;
}

export type MissedRunRead =
  { ok: true; run: MissedRunHeader } | { ok: false; reason: "not_found" | "failed" };

/** A live missed run's header. "not_found" for an ordinary run, or one not open to the student. */
export async function readMissedRun(
  service: Client,
  student: string,
  runId: string,
): Promise<MissedRunRead> {
  const { data, error } = await service.rpc("missed_practice_run", {
    student,
    target_run: runId,
  });
  if (error || !Array.isArray(data)) return { ok: false, reason: "failed" };
  const row = data[0];
  if (!row) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    run: {
      runId: row.run_id,
      bankId: row.bank_id,
      title: row.title,
      seed: row.seed,
      source:
        row.source_kind === "assignment"
          ? { kind: "assignment", id: row.source_id }
          : { kind: "practice", bankId: row.bank_id },
    },
  };
}

/** A run's own marks by question: points and maximum. Only after the run was found live. */
export async function readRunMarks(
  service: Client,
  runId: string,
): Promise<Map<string, { points: number; maxPoints: number }> | null> {
  const { data, error } = await service
    .from("practice_responses")
    .select("item_id, points, max_points")
    .eq("run_id", runId)
    .limit(1000);
  if (error || !data) return null;
  return new Map(
    data.map((row) => [
      row.item_id,
      { points: Number(row.points), maxPoints: Number(row.max_points) },
    ]),
  );
}
