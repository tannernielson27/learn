import { assignmentState } from "@/lib/assignments/assignments";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import type { RosterEntry } from "@/lib/supabase/classes";
import type { ShareEntry } from "@/lib/supabase/practiceShares";

/**
 * The class page's overview, worked out from what the page already reads: the roster, the
 * assignments and the practice shares. Pure, and no query of its own. A part that could not be
 * read stays null, so the page says so rather than showing a zero that is not true.
 */

/** How many recent joins the overview names. */
export const RECENT_JOIN_LIMIT = 3;

export function studentCountLabel(count: number): string {
  return count === 1 ? "1 student" : `${count} students`;
}

export interface ClassOverviewInput {
  roster: readonly RosterEntry[] | null;
  assignments: readonly AssignmentSummary[] | null;
  shares: readonly ShareEntry[] | null;
  now: Date;
}

export interface ClassOverview {
  students: number | null;
  assignments: { open: number; scheduled: number; closed: number } | null;
  practice: number | null;
  /** The assignment a teacher most likely wants: the open one closing first, else the next to open. */
  focus: { assignment: AssignmentSummary; state: "open" | "scheduled" } | null;
  /** Latest to join first. */
  recentJoins: RosterEntry[];
}

function earliest(
  entries: readonly AssignmentSummary[],
  key: "opensAt" | "closesAt",
): AssignmentSummary | undefined {
  return [...entries].sort((a, b) => Date.parse(a[key]) - Date.parse(b[key]))[0];
}

export function summarizeClass({
  roster,
  assignments,
  shares,
  now,
}: ClassOverviewInput): ClassOverview {
  let counts: ClassOverview["assignments"] = null;
  let focus: ClassOverview["focus"] = null;
  if (assignments) {
    const open = assignments.filter((a) => assignmentState(a.opensAt, a.closesAt, now) === "open");
    const scheduled = assignments.filter(
      (a) => assignmentState(a.opensAt, a.closesAt, now) === "scheduled",
    );
    counts = {
      open: open.length,
      scheduled: scheduled.length,
      closed: assignments.length - open.length - scheduled.length,
    };
    const closingFirst = earliest(open, "closesAt");
    const openingNext = earliest(scheduled, "opensAt");
    if (closingFirst) focus = { assignment: closingFirst, state: "open" };
    else if (openingNext) focus = { assignment: openingNext, state: "scheduled" };
  }

  return {
    students: roster ? roster.length : null,
    assignments: counts,
    practice: shares ? shares.length : null,
    focus,
    recentJoins: roster
      ? [...roster]
          .sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt))
          .slice(0, RECENT_JOIN_LIMIT)
      : [],
  };
}
