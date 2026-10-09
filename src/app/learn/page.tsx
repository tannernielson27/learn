import type { Metadata } from "next";
import { resendConfirmation } from "@/app/sign-in/actions";
import { AssignmentHistory } from "@/components/assignments/AssignmentHistory";
import { StudentAssignmentList } from "@/components/assignments/StudentAssignmentList";
import { YourSteps } from "@/components/assignments/YourSteps";
import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { JoinByCodeForm } from "@/components/classes/JoinByCodeForm";
import { StudentClassList } from "@/components/classes/StudentClassList";
import { StudentWelcome } from "@/components/onboarding/StudentWelcome";
import { PracticeBankList } from "@/components/practice/PracticeBankList";
import { historyStore } from "@/lib/assignments/attemptStore";
import { loadStudentRecord } from "@/lib/assignments/history";
import { isEmailUnconfirmed } from "@/lib/auth/emailConfirmation";
import { spansWorkspaces, studentClassInfo } from "@/lib/classes/studentClasses";
import { requireStudent } from "@/lib/classes/viewer";
import {
  readStudentWelcomeState,
  showStudentWelcome,
  studentWelcomeSteps,
} from "@/lib/onboarding/studentWelcome";
import { listOpenAssignments } from "@/lib/supabase/assignments";
import { listMyAttemptProgress } from "@/lib/supabase/attempts";
import { myClasses } from "@/lib/supabase/classInvites";
import { readMyPracticeBanks } from "@/lib/supabase/practice";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { joinClassWithCode, markStudentOnboarded } from "./actions";

export const metadata: Metadata = { title: "Your classes" };

const STUDENT_HOME_HEADING_ID = "student-home-heading";

/**
 * The student home (#205): the classes this student belongs to, and (#207) their open assignments,
 * each linking to where it is taken (#208) with how their attempts stand, and (#238) their history:
 * every closed assignment in their current classes with their best score, linking to its results
 * (#210), and (#239) their clinical judgment steps, weakest first, from the same closed work and
 * (#241) their practice. Practice lists the banks shared with their classes, each opening a run.
 * A student whose classes span more than one workspace reads the workspace on every such row.
 * Anyone who is not a student is sent to their own home by `requireStudent`.
 */
export default async function StudentHomePage() {
  const { supabase, userId, email } = await requireStudent();
  const now = new Date();
  const [claims, classes, assignments, practice, { history, steps }, welcome] = await Promise.all([
    // Read from the token already verified for this request; asked here, on the home only, so
    // the banner never sits over an assignment someone is in the middle of.
    supabase.auth.getClaims().then(({ data }) => data?.claims),
    myClasses(supabase),
    listOpenAssignments(supabase, now),
    readMyPracticeBanks(supabase),
    loadStudentRecord(historyStore(supabase, createSupabaseServiceClient()), userId),
    // #365: three columns of the student's own profile, for a welcome shown once.
    readStudentWelcomeState(supabase, userId),
  ]);
  // #242: due times are shown in each class's zone, not the device's. A student whose classes
  // span more than one workspace also gets the workspace beside each class name, and on each
  // practice bank, which names no class.
  const classInfo = studentClassInfo(classes);
  const acrossWorkspaces = spansWorkspaces(classes);
  // #208: how this student's attempts stand at each; a failed read just leaves the counts off.
  const progress =
    (await listMyAttemptProgress(
      supabase,
      (assignments ?? []).map((entry) => entry.id),
    )) ?? undefined;

  return (
    <>
      {isEmailUnconfirmed(claims) ? (
        <ConfirmEmailBanner action={resendConfirmation} email={email} />
      ) : null}
      {/* Focusable from script, not a tab stop: the student welcome (#365) hands focus here. */}
      <h1
        id={STUDENT_HOME_HEADING_ID}
        tabIndex={-1}
        className="mb-6 font-read text-3xl text-ink-1 outline-none"
      >
        Your classes
      </h1>
      {/* #365: drawn from the name, the class names and fixed copy; nothing of any assignment. */}
      {showStudentWelcome(welcome, classes?.length ?? 0) ? (
        <StudentWelcome
          steps={studentWelcomeSteps(
            welcome?.displayName ?? null,
            (classes ?? []).map((entry) => entry.name),
          )}
          onDone={markStudentOnboarded}
          focusAfter={STUDENT_HOME_HEADING_ID}
        />
      ) : null}
      {classes === null ? (
        <p role="alert" className="text-ink-2">
          Your classes could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <StudentClassList classes={classes} />
      )}
      {/* #362: the class code, typed. Open for a student with no class, since it is the next thing
          to do; folded away for one who has classes, where it is an occasional action. */}
      {classes !== null && classes.length > 0 ? (
        <details className="mt-4">
          <summary className="tap-target inline-flex cursor-pointer items-center rounded-sm text-sm font-medium text-accent-ink hover:underline">
            Join another class
          </summary>
          <div className="mt-3">
            <JoinByCodeForm action={joinClassWithCode} />
          </div>
        </details>
      ) : (
        <section aria-labelledby="join-class-heading" className="mt-6">
          <h2 id="join-class-heading" className="mb-3 text-lg font-medium text-ink-1">
            Join a class
          </h2>
          <JoinByCodeForm action={joinClassWithCode} />
        </section>
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
      <section aria-labelledby="practice-heading" className="mt-10">
        <h2 id="practice-heading" className="mb-3 text-lg font-medium text-ink-1">
          Practice
        </h2>
        {practice === null ? (
          <p role="alert" className="text-ink-2">
            Your practice could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <PracticeBankList banks={practice} showWorkspace={acrossWorkspaces} />
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
      <section aria-labelledby="steps-heading" className="mt-10">
        <h2 id="steps-heading" className="mb-3 text-lg font-medium text-ink-1">
          Your steps
        </h2>
        {steps === null ? (
          <p role="alert" className="text-ink-2">
            Your steps could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <YourSteps standings={steps} />
        )}
      </section>
    </>
  );
}
