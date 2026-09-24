import type { Metadata } from "next";
import { ClosedAssignmentList } from "@/components/assignments/ClosedAssignmentList";
import { StudentAssignmentList } from "@/components/assignments/StudentAssignmentList";
import { StudentClassList } from "@/components/classes/StudentClassList";
import { requireStudent } from "@/lib/classes/viewer";
import { listClosedAssignments, listOpenAssignments } from "@/lib/supabase/assignments";
import { listMyAttemptProgress } from "@/lib/supabase/attempts";
import { myClasses } from "@/lib/supabase/classInvites";

export const metadata: Metadata = { title: "Your classes" };

/**
 * The student home (#205): the classes this student belongs to, and (#207) their open assignments,
 * each linking to where it is taken (#208) with how their attempts stand, and (#210) the ones that
 * have closed, each linking to its results. Anyone who is not a student is sent to their own home
 * by `requireStudent`.
 */
export default async function StudentHomePage() {
  const { supabase } = await requireStudent();
  const now = new Date();
  const [classes, assignments, closed] = await Promise.all([
    myClasses(supabase),
    listOpenAssignments(supabase, now),
    listClosedAssignments(supabase, now),
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
      <section aria-labelledby="closed-assignments-heading" className="mt-10">
        <h2 id="closed-assignments-heading" className="mb-3 text-lg font-medium text-ink-1">
          Closed assignments
        </h2>
        {closed === null ? (
          <p role="alert" className="text-ink-2">
            Your closed assignments could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <ClosedAssignmentList assignments={closed} classes={classInfo} />
        )}
      </section>
    </>
  );
}
