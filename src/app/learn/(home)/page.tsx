import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { resendConfirmation } from "@/app/sign-in/actions";
import { AssignmentHistory } from "@/components/assignments/AssignmentHistory";
import { StudentAssignmentList } from "@/components/assignments/StudentAssignmentList";
import { YourSteps } from "@/components/assignments/YourSteps";
import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { JoinByCodeForm } from "@/components/classes/JoinByCodeForm";
import { LiveSessionHistory } from "@/components/learn/LiveSessionHistory";
import { StudentClassList } from "@/components/classes/StudentClassList";
import { PickUpCard } from "@/components/learn/PickUpCard";
import { PracticeBankList } from "@/components/practice/PracticeBankList";
import { buttonClasses } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { historyStore } from "@/lib/assignments/attemptStore";
import { loadStudentRecord } from "@/lib/assignments/history";
import { pickUp } from "@/lib/assignments/pickUp";
import { isEmailUnconfirmed } from "@/lib/auth/emailConfirmation";
import { spansWorkspaces, studentClassInfo } from "@/lib/classes/studentClasses";
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

/** A part that did not load: a neutral system message, not feedback red (PLAN D11). */
function DidNotLoad({ children }: { children: ReactNode }) {
  return <Notice>{children}</Notice>;
}

const H2 = "mb-3 text-lg font-semibold text-ink-1";

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
 * Laid out as the StudentHome mockup: what to pick up first, then the lists, each row one action.
 * One column on a phone; from 1024px the lists on the left and the steps, the class code and the
 * live session on the right. Its loading screen is `loading.tsx` beside it, in the `(home)` group
 * so that it wraps this page alone: above the players it would turn their 404s into 200s.
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
  // #242: due times are shown in each class's zone, not the device's. A student whose classes
  // span more than one workspace also gets the workspace beside each class name, and on each
  // practice quiz, which names no class.
  const classInfo = studentClassInfo(classes);
  const acrossWorkspaces = spansWorkspaces(classes);
  const progress = counts ?? undefined;
  const pick = pickUp(assignments, progress, practice);
  const inAClass = classes !== null && classes.length > 0;

  return (
    <>
      {isEmailUnconfirmed(claims) ? (
        <ConfirmEmailBanner action={resendConfirmation} email={email} />
      ) : null}
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="font-read text-display leading-tight text-ink-1">Your classes</h1>
        {inAClass ? <StudentClassList classes={classes} /> : null}
      </header>
      {/* #362: no class yet, so the class code is the next thing to do, and comes first. */}
      {classes === null ? (
        <div className="mb-8">
          <DidNotLoad>Your classes did not load. Reload the page.</DidNotLoad>
        </div>
      ) : classes.length === 0 ? (
        <div className="mb-10 flex flex-col gap-6">
          <StudentClassList classes={classes} />
          <section aria-labelledby="join-class-heading">
            <h2 id="join-class-heading" className={H2}>
              Join a class
            </h2>
            <JoinByCodeForm action={joinClassWithCode} />
          </section>
        </div>
      ) : null}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          {pick ? <PickUpCard pick={pick} classes={classInfo} progress={progress} /> : null}
          <section aria-labelledby="open-assignments-heading">
            <h2 id="open-assignments-heading" className={H2}>
              Assignments
            </h2>
            {assignments === null ? (
              <DidNotLoad>Your assignments did not load. Reload the page.</DidNotLoad>
            ) : (
              <StudentAssignmentList
                assignments={assignments}
                classes={classInfo}
                progress={progress}
              />
            )}
          </section>
          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className={H2}>
              Results
            </h2>
            {history === null ? (
              <DidNotLoad>Your results did not load. Reload the page.</DidNotLoad>
            ) : (
              <AssignmentHistory rows={history} classes={classInfo} />
            )}
          </section>
          <section aria-labelledby="live-history-heading">
            <h2 id="live-history-heading" className={H2}>
              Live sessions
            </h2>
            {live === null ? (
              <DidNotLoad>Your live sessions did not load. Reload the page.</DidNotLoad>
            ) : (
              <LiveSessionHistory rows={buildLiveHistory(live)} classes={classInfo} />
            )}
          </section>
          <section aria-labelledby="practice-heading">
            <h2 id="practice-heading" className={H2}>
              Practice
            </h2>
            {practice === null ? (
              <DidNotLoad>Your practice did not load. Reload the page.</DidNotLoad>
            ) : (
              <PracticeBankList banks={practice} showWorkspace={acrossWorkspaces} />
            )}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className={H2}>
              Your clinical judgment steps
            </h2>
            {steps === null ? (
              <DidNotLoad>Your steps did not load. Reload the page.</DidNotLoad>
            ) : (
              <YourSteps standings={steps} />
            )}
          </section>
          {/* #362: folded away for a student who has classes, where it is an occasional action. */}
          {inAClass ? (
            <div>
              <details>
                <summary className="tap-target inline-flex cursor-pointer items-center rounded-sm font-semibold text-accent-ink underline-offset-4 hover:underline">
                  Join another class
                </summary>
                <div className="mt-3">
                  <JoinByCodeForm action={joinClassWithCode} />
                </div>
              </details>
            </div>
          ) : null}
          {/* No account needed for a live session; the button is the whole of it (mockup). */}
          <Link href="/join" className={buttonClasses({ variant: "secondary", block: true })}>
            Join a live session
          </Link>
        </div>
      </div>
    </>
  );
}
