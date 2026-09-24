import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttemptPlayer } from "@/components/assignments/AttemptPlayer";
import { AttemptSummary } from "@/components/assignments/AttemptSummary";
import { LocalTime } from "@/components/assignments/LocalTime";
import { StartAttemptForm } from "@/components/assignments/StartAttemptForm";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { loadAttemptPage, type AssignmentHeader } from "@/lib/assignments/attemptPage";
import { attemptPageStore } from "@/lib/assignments/attemptStore";
import { attemptsLabel } from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { requireStudent } from "@/lib/classes/viewer";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { startAssignmentAttempt, submitAssignmentAttempt } from "./actions";

export const metadata: Metadata = { title: "Assignment" };

function Header({ assignment }: { assignment: AssignmentHeader }) {
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
        Closes <LocalTime iso={assignment.closesAt} /> · {attemptsLabel(assignment.maxAttempts)}
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
  const view = await loadAttemptPage(
    attemptPageStore(supabase, createSupabaseServiceClient()),
    assignmentId,
    userId,
    new Date(),
  );

  if (view.kind === "missing") notFound();
  if (view.kind === "failed") {
    return (
      <p role="alert" className="text-ink-2">
        This assignment could not be loaded. Reload the page to try again.
      </p>
    );
  }

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
        <Header assignment={view.assignment} />
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
      <Header assignment={view.assignment} />
      {view.closed ? (
        <p role="status" className="measure mt-6 text-ink-1">
          This assignment has closed.
        </p>
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
