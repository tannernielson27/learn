import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttemptPlayer } from "@/components/assignments/AttemptPlayer";
import { AttemptSummary } from "@/components/assignments/AttemptSummary";
import { ClassTime } from "@/components/assignments/ClassTime";
import { StartAttemptForm } from "@/components/assignments/StartAttemptForm";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { loadAttemptPage, type AssignmentHeader } from "@/lib/assignments/attemptPage";
import { attemptPageStore } from "@/lib/assignments/attemptStore";
import { attemptsLabel, studentResultsPath } from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { zoneOfClass } from "@/lib/classes/timeZone";
import { requireStudent } from "@/lib/classes/viewer";
import { myClasses } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { startAssignmentAttempt, submitAssignmentAttempt } from "./actions";

export const metadata: Metadata = { title: "Assignment" };

function Header({ assignment, timeZone }: { assignment: AssignmentHeader; timeZone: string }) {
  return (
    <>
      <p className="mb-2 text-sm text-ink-2">
        <Link href={STUDENT_HOME} className="tap-target inline-flex items-center hover:text-ink-1">
          Your classes
        </Link>
      </p>
      <p className="eyebrow mb-2">Assignment</p>
      <h1 className="font-read text-3xl break-words text-ink-1">{assignment.title}</h1>
      <p className="mt-2 text-sm text-ink-2">
        Closes <ClassTime iso={assignment.closesAt} timeZone={timeZone} /> ·{" "}
        {attemptsLabel(assignment.maxAttempts)}
      </p>
    </>
  );
}

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
      <p role="alert" className="text-ink-2">
        This assignment could not be loaded. Reload the page to try again.
      </p>
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
        submit={submitAssignmentAttempt.bind(null, view.assignment.id)}
      />
    );
    return (
      <>
        <Header assignment={view.assignment} timeZone={timeZone} />
        <div className="mt-6">
          {view.record ? <RecordLayout record={view.record}>{player}</RecordLayout> : player}
        </div>
      </>
    );
  }

  const latest = view.attempts.at(-1);
  const submitted = latest?.submittedAt != null;
  return (
    <>
      <Header assignment={view.assignment} timeZone={timeZone} />
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
          Submitted. Your results will be shown when the assignment closes.
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
