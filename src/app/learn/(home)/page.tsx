import type { Metadata } from "next";
import { resendConfirmation } from "@/app/sign-in/actions";
import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { StudentHome } from "@/components/learn/StudentHome";
import { historyStore } from "@/lib/assignments/attemptStore";
import { loadStudentRecord } from "@/lib/assignments/history";
import { isEmailUnconfirmed } from "@/lib/auth/emailConfirmation";
import { buildLiveHistory } from "@/lib/learn/liveHistory";
import { requireStudent } from "@/lib/classes/viewer";
import { listOpenAssignments } from "@/lib/supabase/assignments";
import { listMyAttemptProgress } from "@/lib/supabase/attempts";
import { myClasses } from "@/lib/supabase/classInvites";
import { readMyLiveResults } from "@/lib/supabase/liveResults";
import { readMyPracticeBanks } from "@/lib/supabase/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { joinClassWithCode } from "../actions";

export const metadata: Metadata = { title: "Your classes" };

/**
 * The student home (#205): the classes this student belongs to, and (#207) their open assignments,
 * each linking to where it is taken (#208) with how their attempts stand, and (#238) their history:
 * every closed assignment in their current classes with their best score, linking to its results
 * (#210), and (#239) their clinical judgment steps, weakest first, from the same closed work and
 * (#241) their practice. Practice lists the quizzes shared with their classes. Live sessions lists
 * the ended live sessions they joined signed in for their class, with their own score, each
 * linking to its results; their answers there count toward their steps too.
 * A student whose classes span more than one workspace reads the workspace on every such row.
 * Anyone who is not a student is sent to their own home by `requireStudent`.
 *
 * The page reads; `StudentHome` lays it out (#563): the join code first, then what to pick up,
 * then the lists that have something in them. Its loading screen is `loading.tsx` beside it, in
 * the `(home)` group so that it wraps this page alone: above the players it would turn their 404s
 * into 200s.
 */
export default async function StudentHomePage() {
  const { supabase, userId, email } = await requireStudent();
  const now = new Date();
  // #208: how this student's attempts stand at each open assignment; a failed read just leaves the
  // counts off. perf-audit #15: read as soon as the open assignments are in, beside the history.
  const openRead = listOpenAssignments(supabase, now);
  const progressRead = openRead.then((open) =>
    listMyAttemptProgress(
      supabase,
      (open ?? []).map((entry) => entry.id),
    ),
  );
  const [claims, classes, assignments, practice, { history, steps }, live, counts] =
    await Promise.all([
      // Read from the token already verified for this request; asked here, on the home only, so
      // the banner never sits over an assignment someone is in the middle of.
      supabase.auth.getClaims().then(({ data }) => data?.claims),
      myClasses(supabase),
      openRead,
      readMyPracticeBanks(supabase),
      loadStudentRecord(historyStore(supabase, createSupabaseServiceClient()), userId),
      // Ended sessions only, and only the student's own linked participant rows.
      readMyLiveResults(supabase),
      progressRead,
    ]);
  return (
    <>
      {isEmailUnconfirmed(claims) ? (
        <ConfirmEmailBanner action={resendConfirmation} email={email} />
      ) : null}
      <StudentHome
        classes={classes}
        assignments={assignments}
        progress={counts ?? undefined}
        practice={practice}
        history={history}
        steps={steps}
        live={live === null ? null : buildLiveHistory(live)}
        joinClass={joinClassWithCode}
      />
    </>
  );
}
