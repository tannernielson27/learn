import Link from "next/link";
import {
  attemptProgressLabel,
  studentAssignmentPath,
  type AttemptProgress,
} from "@/lib/assignments/assignments";
import type { PickUp } from "@/lib/assignments/pickUp";
import { classLabel, type StudentClassInfo } from "@/lib/classes/studentClasses";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import { practicePath, practiceProgressLabel } from "@/lib/practice/paths";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import type { PracticeBank } from "@/lib/supabase/practice";
import { ClassTime } from "@/components/assignments/ClassTime";
import { buttonClasses } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";

export interface PickUpCardProps {
  pick: PickUp<AssignmentSummary, PracticeBank>;
  classes: ReadonlyMap<string, StudentClassInfo>;
  progress?: ReadonlyMap<string, AttemptProgress>;
}

const HEADING_ID = "pick-up-heading";
const TITLE_ID = "pick-up-title";

const HEADINGS = {
  resume_assignment: "Pick up where you left off",
  next_assignment: "Due next",
  resume_practice: "Pick up where you left off",
} as const;

/**
 * The first card on the student home (StudentHome mockup): the one thing to do next, from `pickUp`,
 * with one action. The title is plain text and the action's words are short ("Resume"), so the
 * same assignment's row in the list below keeps the only link named after it; the action is
 * described by the title for a screen reader.
 */
export function PickUpCard({ pick, classes, progress }: PickUpCardProps) {
  const body =
    pick.kind === "resume_practice" ? (
      <>
        <ProgressBar
          value={pick.bank.answered}
          max={pick.bank.itemCount}
          label="Questions answered"
          valueText={practiceProgressLabel(pick.bank)}
        />
        <p className="tabular text-sm text-ink-2">Practice · {practiceProgressLabel(pick.bank)}</p>
      </>
    ) : (
      <p className="text-sm break-words text-ink-2">
        {classLabel(classes.get(pick.assignment.classId))} ·{" "}
        {attemptProgressLabel(pick.assignment.maxAttempts, progress?.get(pick.assignment.id))} ·
        Closes{" "}
        <ClassTime
          iso={pick.assignment.closesAt}
          timeZone={classes.get(pick.assignment.classId)?.timeZone ?? DEFAULT_CLASS_TIME_ZONE}
        />
      </p>
    );
  const title = pick.kind === "resume_practice" ? pick.bank.name : pick.assignment.title;
  const href =
    pick.kind === "resume_practice"
      ? practicePath(pick.bank.bankId)
      : studentAssignmentPath(pick.assignment.id);
  const action = pick.kind === "next_assignment" ? "Open assignment" : "Resume";

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-3 rounded-md border border-line-field bg-surface-1 p-4 sm:p-5"
    >
      <h2 id={HEADING_ID} className="eyebrow">
        {HEADINGS[pick.kind]}
      </h2>
      <p id={TITLE_ID} className="text-lg leading-snug font-semibold break-words text-ink-1">
        {title}
      </p>
      {body}
      <Link
        href={href}
        aria-describedby={TITLE_ID}
        className={`${buttonClasses({ variant: "primary", block: true })} sm:w-auto sm:self-start`}
      >
        {action}
      </Link>
    </section>
  );
}
