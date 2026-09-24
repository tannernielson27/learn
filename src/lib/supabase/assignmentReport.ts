import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReportAttemptInput,
  ReportMarkInput,
  ReportStudentInput,
} from "@/lib/assignments/report";
import { isUuid } from "@/lib/authoring/ids";
import type { Database, Json } from "./database.types";
import { readAllPages } from "./sessionReport";

type Client = SupabaseClient<Database>;

/**
 * The reads behind the assignment report (#211), as the signed-in author.
 *
 * The assignment itself is read under its row level security, so one in another org reads as
 * absent. The attempts come from `public.assignment_report_rows`, the one way an author reaches a
 * score: it answers only an author of the assignment's org, and before the close it withholds every
 * score and mark. Nothing here decides who may see what.
 */

export interface ReportAssignment {
  id: string;
  classId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  maxAttempts: number;
  /** Row ids of the items, in the set's order. */
  itemSet: string[];
}

export interface AssignmentReportRows {
  /** Whether the database handed over scores: the assignment has closed. */
  released: boolean;
  students: ReportStudentInput[];
  attempts: ReportAttemptInput[];
}

type ReportRow = Database["public"]["Functions"]["assignment_report_rows"]["Returns"][number];

function toItemSet(value: Json | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && isUuid(entry));
}

/** The assignment, or null when this author cannot see it. Throws when the read fails. */
export async function readReportAssignment(
  client: Client,
  assignmentId: string,
): Promise<ReportAssignment | null> {
  const { data, error } = await client
    .from("assignments")
    .select("id, class_id, title, opens_at, closes_at, max_attempts, item_set")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw new Error(`could not read assignment: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    classId: data.class_id,
    title: data.title,
    opensAt: data.opens_at,
    closesAt: data.closes_at,
    maxAttempts: data.max_attempts,
    itemSet: toItemSet(data.item_set),
  };
}

/** numeric over PostgREST is a number, but a driver may hand back a string. */
const toNumber = (value: unknown): number | null =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

/** Stored JSON is external input: a mark that is not a well-formed one is left out. */
function toMarks(value: Json | null): ReportMarkInput[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const points = toNumber(entry.points);
    const maxPoints = toNumber(entry.max_points);
    return typeof entry.item_id === "string" && points !== null && maxPoints !== null
      ? [{ itemId: entry.item_id, points, maxPoints }]
      : [];
  });
}

/** A student with no display name set goes by their address, as the class roster shows them. */
const nameOf = (row: ReportRow): string => row.display_name?.trim() || row.email;

function toAttempt(row: ReportRow): ReportAttemptInput {
  return {
    studentId: row.student_id,
    id: row.attempt_id,
    number: row.attempt_number,
    submittedAt: row.submitted_at,
    score: toNumber(row.score),
    maxScore: toNumber(row.max_score),
    marks: toMarks(row.marks),
  };
}

/**
 * Every current member, every student removed after attempting (#242), and every attempt of
 * theirs. Throws when a read fails part way.
 */
export async function readAssignmentReportRows(
  client: Client,
  assignmentId: string,
): Promise<AssignmentReportRows> {
  const rows = await readAllPages<ReportRow>(
    (from, to) =>
      client.rpc("assignment_report_rows", { target_assignment: assignmentId }).range(from, to),
    "assignment report",
  );
  const students = new Map<string, ReportStudentInput>();
  for (const row of rows) {
    if (!students.has(row.student_id)) {
      students.set(row.student_id, {
        id: row.student_id,
        displayName: nameOf(row),
        // Only the database's own word makes someone removed; anything else is a member.
        membership: row.membership === "removed" ? "removed" : "member",
      });
    }
  }
  return {
    released: rows.length > 0 && rows.every((row) => row.scores_released),
    students: [...students.values()],
    attempts: rows.filter((row) => row.attempt_id !== null).map(toAttempt),
  };
}
