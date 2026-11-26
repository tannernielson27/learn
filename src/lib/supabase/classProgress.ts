import type { SupabaseClient } from "@supabase/supabase-js";
import type { Membership, StudentStatus } from "@/lib/assignments/report";
import type {
  ActivityKind,
  ClassProgressInput,
  ProgressRowInput,
  ProgressStepInput,
} from "@/lib/classes/progress";
import { type ClientNeed, isClientNeed } from "@/lib/ngn/tags";
import type { CjmmStep } from "@/lib/ngn/types";
import type { Database } from "./database.types";
import { readAllPages, type SessionListRow } from "./sessionReport";

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

// ---------------------------------------------------------------------------
// The class's results over time (#618)
// ---------------------------------------------------------------------------

/** `class_progress_trend`'s group_key for a question with no client needs tag. */
export const NO_CATEGORY_KEY = "none";

/** A clinical judgment step, or a client needs category; a null category is "No category". */
export type TrendGroup =
  { kind: "step"; step: CjmmStep } | { kind: "category"; category: ClientNeed | null };

/** The class's figure for one group in one ended live session or closed assignment. */
export interface ClassTrendRow {
  kind: ActivityKind;
  activityId: string;
  title: string;
  /** A live session's start; an assignment's close. */
  occurredAt: string;
  group: TrendGroup;
  /** Members with a scored answer in the group in this activity. */
  students: number;
  answers: number;
  /** The mean of those members' own percents, each member once; 0-100. */
  percent: number | null;
}

/** The class's all-term figure for one client needs category, from the same answers. */
export interface ClassTermCategoryRow {
  category: ClientNeed | null;
  students: number;
  answers: number;
  percent: number | null;
}

export interface ClassProgressTrend {
  /** Oldest activity first, as the function orders them. */
  rows: ClassTrendRow[];
  term: ClassTermCategoryRow[];
}

type TrendRowGenerated = Database["public"]["Functions"]["class_progress_trend"]["Returns"][number];
/** The generated types do not know a term row has no activity. */
type TrendRowRead = { [K in keyof TrendRowGenerated]: TrendRowGenerated[K] | null };

function toCategory(key: string | null): { category: ClientNeed | null } | null {
  if (key === NO_CATEGORY_KEY) return { category: null };
  return key !== null && isClientNeed(key) ? { category: key } : null;
}

function toGroup(row: TrendRowRead): TrendGroup | null {
  if (row.group_kind === "step") {
    const step = Number(row.group_key);
    return row.group_key !== null && isCjmmStep(step) ? { kind: "step", step } : null;
  }
  if (row.group_kind === "category") {
    const held = toCategory(row.group_key);
    return held && { kind: "category", ...held };
  }
  return null;
}

/**
 * How the class has done on each clinical judgment step and client needs category, activity by
 * activity, and its all-term figure per category. Runs as the signed-in teacher; anyone else gets
 * no rows. Throws when a read fails part way. A row it does not understand is dropped.
 */
export async function readClassProgressTrend(
  supabase: Client,
  classId: string,
): Promise<ClassProgressTrend> {
  const read: TrendRowRead[] = await readAllPages(
    (from, to) => supabase.rpc("class_progress_trend", { target_class: classId }).range(from, to),
    "class progress trend",
  );
  const trend: ClassProgressTrend = { rows: [], term: [] };
  for (const row of read) {
    const counts = {
      students: row.students ?? 0,
      answers: row.answers ?? 0,
      percent: numberOrNull(row.percent),
    };
    if (row.activity_kind === "term") {
      const held = row.group_kind === "category" ? toCategory(row.group_key) : null;
      if (held) trend.term.push({ ...held, ...counts });
      continue;
    }
    if (row.activity_kind !== "session" && row.activity_kind !== "assignment") continue;
    const group = toGroup(row);
    if (!group || row.activity_id === null || row.occurred_at === null) continue;
    trend.rows.push({
      kind: row.activity_kind,
      activityId: row.activity_id,
      title: row.title ?? "",
      occurredAt: row.occurred_at,
      group,
      ...counts,
    });
  }
  return trend;
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
): Promise<SessionListRow[] | null> {
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
