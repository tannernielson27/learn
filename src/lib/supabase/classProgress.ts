import type { SupabaseClient } from "@supabase/supabase-js";
import type { Membership, StudentStatus } from "@/lib/assignments/report";
import type {
  ActivityKind,
  ClassProgressInput,
  ProgressRowInput,
  ProgressStepInput,
} from "@/lib/classes/progress";
import type { CjmmStep } from "@/lib/ngn/types";
import type { Database } from "./database.types";
import { readAllPages, type SessionSummary } from "./sessionReport";

type Client = SupabaseClient<Database>;

/**
 * The reads behind a class's Progress tab, its Live sessions tab and its students' pages. Every
 * one runs as the signed-in teacher. `class_progress` and `class_progress_steps` answer only an
 * author of the class's own workspace, and anyone else gets no rows, so a class in another
 * workspace reads exactly like an empty one; the page has already read the class itself under row
 * level security and answered not-found before any of these run. No service role.
 */

const STATUSES: readonly StudentStatus[] = ["not_started", "in_progress", "submitted"];
const isStatus = (value: string | null): value is StudentStatus =>
  STATUSES.some((status) => status === value);

const isCjmmStep = (value: number): value is CjmmStep =>
  Number.isInteger(value) && value >= 1 && value <= 6;

/** numeric over PostgREST is a number, but a string is what a driver may hand back. */
const numberOrNull = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

type ProgressRow = Database["public"]["Functions"]["class_progress"]["Returns"][number];
type StepRowRead = Database["public"]["Functions"]["class_progress_steps"]["Returns"][number];

function toRow(row: ProgressRow): ProgressRowInput | null {
  if (row.activity_kind !== "session" && row.activity_kind !== "assignment") return null;
  const kind: ActivityKind = row.activity_kind;
  const membership: Membership = row.membership === "removed" ? "removed" : "member";
  return {
    profileId: row.profile_id,
    name: row.display_name?.trim() || row.email,
    email: row.email,
    membership,
    kind,
    activityId: row.activity_id,
    title: row.title,
    occurredAt: row.occurred_at,
    state: row.activity_state,
    attended: row.attended,
    status: isStatus(row.status) ? row.status : null,
    attemptsUsed: row.attempts_used,
    attemptNumber: row.attempt_number,
    points: numberOrNull(row.points),
    possible: numberOrNull(row.possible),
    percent: numberOrNull(row.percent),
  };
}

function toStep(row: StepRowRead): ProgressStepInput | null {
  const step = Number(row.step);
  if (!isCjmmStep(step)) return null;
  return {
    profileId: row.profile_id,
    step,
    answered: row.answered,
    meanPercent: numberOrNull(row.mean_percent),
  };
}

/**
 * Everything the Progress tab is built from. Throws when a read fails part way, so a half-read
 * class is never shown as a real one. A class of 40 students and 30 activities is 1,200 rows, past
 * PostgREST's page, so both are read a page at a time, in the functions' own order.
 */
export async function readClassProgress(
  supabase: Client,
  classId: string,
): Promise<ClassProgressInput> {
  const [rows, steps] = await Promise.all([
    readAllPages(
      (from, to) => supabase.rpc("class_progress", { target_class: classId }).range(from, to),
      "class progress",
    ),
    readAllPages(
      (from, to) => supabase.rpc("class_progress_steps", { target_class: classId }).range(from, to),
      "class progress steps",
    ),
  ]);
  return {
    rows: rows.flatMap((row) => toRow(row) ?? []),
    steps: steps.flatMap((row) => toStep(row) ?? []),
  };
}

/** How many of a class's live sessions the tab lists, newest first. */
export const CLASS_SESSION_LIMIT = 100;

/**
 * The class's live sessions, newest first, with how many people joined each (guests included, as
 * on the Live sessions page). Row level security keeps it to the teacher's own workspace. Null
 * when the read fails.
 */
export async function listClassSessions(
  supabase: Client,
  classId: string,
): Promise<SessionSummary[] | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, status, opened_at, closed_at, participants(id)")
    .eq("class_id", classId)
    .order("opened_at", { ascending: false })
    .limit(CLASS_SESSION_LIMIT);
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    participantCount: row.participants.length,
  }));
}
