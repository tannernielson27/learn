import type { Metadata } from "next";
import { AssignmentHistory } from "@/components/assignments/AssignmentHistory";
import { StudentAssignmentList } from "@/components/assignments/StudentAssignmentList";
import { StudentClassList } from "@/components/classes/StudentClassList";
import { historyStore } from "@/lib/assignments/attemptStore";
import { loadHistory } from "@/lib/assignments/history";
import { requireStudent } from "@/lib/classes/viewer";
import { listOpenAssignments } from "@/lib/supabase/assignments";
import { listMyAttemptProgress } from "@/lib/supabase/attempts";
import { myClasses } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Your classes" };

/**
 * The student home (#205): the classes this student belongs to, and (#207) their open assignments,
 * each linking to where it is taken (#208) with how their attempts stand, and (#238) their history:
 * every closed assignment in their current classes with their best score, linking to its results
 * (#210). Anyone who is not a student is sent to their own home by `requireStudent`.
 */
export default async function StudentHomePage() {
  const { supabase, userId } = await requireStudent();
  const now = new Date();
  const [classes, assignments, history] = await Promise.all([
    myClasses(supabase),
    listOpenAssignments(supabase, now),
    loadHistory(historyStore(supabase, createSupabaseServiceClient()), userId),
  ]);
  // #242: due times are shown in each class's zone, not the device's.
  const classInfo = new Map(
    (classes ?? []).map((entry) => [entry.id, { name: entry.name, timeZone: entry.timeZone }]),
  );
  // #208: how this student's attempts stand at each; a failed read just leaves the counts off.
  const progress =
    (await listMyAttemptProgress(
      supabase,
      (assignments ?? []).map((entry) => entry.id),
    )) ?? undefined;

  return (
    <>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Your classes</h1>
      {classes === null ? (
        <p role="alert" className="text-ink-2">
          Your classes could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <StudentClassList classes={classes} />
      )}
      <section aria-labelledby="open-assignments-heading" className="mt-10">
        <h2 id="open-assignments-heading" className="mb-3 text-lg font-medium text-ink-1">
          Open assignments
        </h2>
        {assignments === null ? (
          <p role="alert" className="text-ink-2">
            Your assignments could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <StudentAssignmentList
            assignments={assignments}
            classes={classInfo}
            progress={progress}
          />
        )}
      </section>
      <section aria-labelledby="history-heading" className="mt-10">
        <h2 id="history-heading" className="mb-3 text-lg font-medium text-ink-1">
          History
        </h2>
        {history === null ? (
          <p role="alert" className="text-ink-2">
            Your history could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <AssignmentHistory rows={history} classes={classInfo} />
        )}
      </section>
    </>
  );
}
