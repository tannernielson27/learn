import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttemptPlayer } from "@/components/assignments/AttemptPlayer";
import { AssignmentPageHeader } from "@/components/assignments/AssignmentPageHeader";
import { AttemptSummary } from "@/components/assignments/AttemptSummary";
import { StartAttemptForm } from "@/components/assignments/StartAttemptForm";
import { Notice } from "@/components/ui/Notice";
import { PageWidth } from "@/components/ui/PageWidth";
import { loadAttemptPage } from "@/lib/assignments/attemptPage";
import { attemptPageStore } from "@/lib/assignments/attemptStore";
import { studentResultsPath } from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { zoneOfClass } from "@/lib/classes/timeZone";
import { requireStudent } from "@/lib/classes/viewer";
import { myClasses } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { startAssignmentAttempt, submitAssignmentAttempt } from "./actions";

export const metadata: Metadata = { title: "Assignment" };

/**
 * One assignment, as its student takes it (#208). Everything is decided on the server by
 * `loadAttemptPage`: whether this student may see it at all (row level security), whether the
 * window has closed (and if so, the submit at close for their open attempt), and — while an attempt
 * is open — the set, keyless and shuffled per attempt, with what they last saved. The page renders
 * that view and nothing else, so nothing here can add a key, a rationale or a score to the payload.
 */
export default async function StudentAssignmentPage({
  params,
}: PageProps<"/learn/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  if (!isUuid(assignmentId)) notFound();

  const { supabase, userId } = await requireStudent();
  const [view, classes] = await Promise.all([
    loadAttemptPage(
      attemptPageStore(supabase, createSupabaseServiceClient()),
      assignmentId,
      userId,
      new Date(),
    ),
    myClasses(supabase),
  ]);

  if (view.kind === "missing") notFound();
  if (view.kind === "failed") {
    return (
      <Notice role="alert" live={false}>
        This assignment did not load. Reload the page.
      </Notice>
    );
  }
  // #242: the close is said in the class's zone, as on the student home and in the reminder email.
  const timeZone = zoneOfClass(classes, view.assignment.classId);

  if (view.kind === "taking") {
    const player = (
      <AttemptPlayer
        attemptId={view.attempt.id}
        attemptNumber={view.attempt.number}
        items={view.items}
        total={view.total}
        // #335: one chart per reached step, never the whole record; the player shows the one for
        // the step on screen.
        {...(view.records === null ? {} : { records: view.records })}
        submit={submitAssignmentAttempt.bind(null, view.assignment.id)}
      />
    );
    // PracticeCase: the patient record and the question side by side need the wide width.
    return (
      <PageWidth width="wide">
        <AssignmentPageHeader assignment={view.assignment} timeZone={timeZone} />
        <div className="mt-6">{player}</div>
      </PageWidth>
    );
  }

  const latest = view.attempts.at(-1);
  const submitted = latest?.submittedAt != null;
  return (
    <>
      <AssignmentPageHeader assignment={view.assignment} timeZone={timeZone} />
      {view.closed ? (
        <>
          <p role="status" className="measure mt-6 text-ink-1">
            This assignment has closed.
          </p>
          <p className="mt-4">
            <Link
              href={studentResultsPath(view.assignment.id)}
              className="tap-target inline-flex items-center font-medium text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
            >
              See your results
            </Link>
          </p>
        </>
      ) : submitted ? (
        <p role="status" data-testid="submitted-notice" className="measure mt-6 text-ink-1">
          Submitted. Results show when the assignment closes.
        </p>
      ) : null}
      <AttemptSummary attempts={view.attempts} closed={view.closed} />
      {view.canStart ? (
        <StartAttemptForm
          start={startAssignmentAttempt.bind(null, view.assignment.id)}
          label={view.attempts.length === 0 ? "Start" : `Start attempt ${view.attempts.length + 1}`}
        />
      ) : !view.closed && submitted ? (
        <p className="measure mt-6 text-sm text-ink-2">You have used all your attempts.</p>
      ) : null}
    </>
  );
}
