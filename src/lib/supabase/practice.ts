import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetItem } from "@/lib/assignments/attemptScoring";
import type { Item } from "@/lib/ngn/schemas";
import type { RecordInput, RecordOutcome, RunSlots } from "@/lib/practice/answerRoute";
import type { PracticeCaseStudyRow, PracticeRun, PracticeSlot } from "@/lib/practice/view";
import type { Database, Json } from "./database.types";
import { fromItemRow } from "./itemRows";
import type { StepAttemptMark } from "./steps";

/**
 * Practice runs (#241).
 *
 * The run functions are the service role's alone (see `20260925070000_practice.sql` and, for a
 * run's frozen items, `20260926000000_practice_run_items.sql`): each takes
 * the student the server verified and re-checks, on every call, that the bank is still shared with
 * a class they are a current member of. `readRunAnswers` reads the table directly with the service
 * role, so it is only ever called after `readRunSlots` has said the run is live.
 *
 * The two `readMy…` reads run as the student, under their own session.
 */

type Client = SupabaseClient<Database>;

export type OpenedRun =
  { ok: true; run: PracticeRun } | { ok: false; reason: "not_found" | "failed" };

export async function openPracticeRun(
  service: Client,
  student: string,
  bankId: string,
  fresh: boolean,
): Promise<OpenedRun> {
  const { data, error } = await service.rpc("open_practice_run", {
    student,
    target_bank: bankId,
    fresh,
  });
  if (error || !Array.isArray(data)) return { ok: false, reason: "failed" };
  const row = data[0];
  if (!row) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    run: { runId: row.run_id, bankId: row.bank_id, bankName: row.bank_name, seed: row.seed },
  };
}

/** The live run's items in play order. Empty when it is not live for this student. */
export async function readRunSlots(
  service: Client,
  student: string,
  runId: string,
): Promise<RunSlots | null> {
  const { data, error } = await service.rpc("practice_run_items", {
    student,
    target_run: runId,
  });
  if (error || !Array.isArray(data)) return null;
  const sorted = [...data].sort((a, b) => a.ordinal - b.ordinal);
  const slots: PracticeSlot[] = sorted.map((row) => ({
    itemId: row.item_id,
    caseStudyId: row.case_study_id ?? null,
    step: row.step ?? null,
  }));
  return {
    slots,
    answered: new Set(sorted.filter((row) => row.answered).map((row) => row.item_id)),
  };
}

/**
 * Some of a live run's items, with their keys, in the order asked (#271). A run opened since #271
 * reads the content it recorded at start, so an item edited or unpublished mid-run plays and scores
 * as the student first saw it; an earlier run reads the bank's current items. The function
 * re-checks that the run is live for this student and holds each item. A row that no longer parses
 * is left out, as `readSetItems` does.
 */
/** `practice_run_item_content`'s row limit. */
export const MAX_RUN_ITEM_READ = 1000;

export async function readRunItems(
  service: Client,
  student: string,
  runId: string,
  ids: readonly string[],
): Promise<SetItem[] | null> {
  if (ids.length === 0) return [];
  // The function returns at most this many rows; asking for more would drop items silently.
  if (ids.length > MAX_RUN_ITEM_READ) return null;
  const { data, error } = await service.rpc("practice_run_item_content", {
    student,
    target_run: runId,
    target_items: [...ids],
  });
  if (error || !Array.isArray(data)) return null;
  const byId = new Map<string, Item>();
  for (const row of data) {
    const stored = fromItemRow(row);
    if (stored.ok) byId.set(row.item_id, stored.value);
  }
  return ids.flatMap((rowId) => {
    const item = byId.get(rowId);
    return item ? [{ rowId, item }] : [];
  });
}

/** The run's stored answers by item. Only after `readRunSlots` has found the run live. */
export async function readRunAnswers(
  service: Client,
  runId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await service
    .from("practice_responses")
    .select("item_id, response")
    .eq("run_id", runId)
    .limit(1000);
  if (error || !data) return null;
  return Object.fromEntries(data.map((row) => [row.item_id, row.response]));
}

/** The case studies a run plays: title and record only. */
export async function readPracticeCaseStudies(
  service: Client,
  ids: readonly string[],
): Promise<PracticeCaseStudyRow[] | null> {
  if (ids.length === 0) return [];
  const { data, error } = await service
    .from("case_studies")
    .select("id, title, ehr")
    .in("id", [...ids]);
  if (error || !data) return null;
  return data.map((row) => ({ id: row.id, title: row.title, ehr: row.ehr }));
}

const OUTCOMES: readonly RecordOutcome[] = ["recorded", "answered", "not_found"];

/** Two decimals, as `numeric(8, 2)` stores them. */
const cents = (value: number): number => Math.round(value * 100) / 100;

export async function recordPracticeResponse(
  service: Client,
  input: RecordInput,
): Promise<RecordOutcome> {
  const { data, error } = await service.rpc("record_practice_response", {
    student: input.student,
    target_run: input.runId,
    target_item: input.itemId,
    answer: input.response as unknown as Json,
    earned: cents(input.score.points),
    possible: cents(input.score.maxPoints),
    marks: JSON.parse(JSON.stringify(input.score)) as Json,
  });
  if (error) return "failed";
  return OUTCOMES.find((outcome) => outcome === data) ?? "failed";
}

/** One bank on the student's Practice list. */
export interface PracticeBank {
  bankId: string;
  name: string;
  itemCount: number;
  /** How many items the student's newest run has answered. */
  answered: number;
}

export async function readMyPracticeBanks(client: Client): Promise<PracticeBank[] | null> {
  const { data, error } = await client.rpc("my_practice_banks");
  if (error || !Array.isArray(data)) return null;
  return data.map((row) => ({
    bankId: row.bank_id,
    name: row.bank_name,
    itemCount: row.item_count,
    answered: row.answered,
  }));
}

/** numeric over PostgREST is a number, but a driver may hand back a string. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The student's practice marks by step (#239's "practice" source): a step and two numbers each. */
export async function readMyPracticeStepMarks(client: Client): Promise<StepAttemptMark[] | null> {
  const { data, error } = await client.rpc("my_practice_step_marks");
  if (error || !Array.isArray(data)) return null;
  return data.flatMap((row) => {
    const points = toNumber(row.points);
    const maxPoints = toNumber(row.max_points);
    if (points === null || maxPoints === null) return [];
    const step = typeof row.cjmm_step === "number" ? row.cjmm_step : null;
    return [{ cjmmStep: step, points, maxPoints }];
  });
}
