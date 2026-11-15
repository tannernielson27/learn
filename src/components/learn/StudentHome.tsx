import type { ReactNode } from "react";
import { AssignmentHistory } from "@/components/assignments/AssignmentHistory";
import { StudentAssignmentList } from "@/components/assignments/StudentAssignmentList";
import { YourSteps } from "@/components/assignments/YourSteps";
import { JoinByCodeForm, type JoinByCodeFormProps } from "@/components/classes/JoinByCodeForm";
import { StudentClassList } from "@/components/classes/StudentClassList";
import { JoinCodeForm, type JoinCodeFormProps } from "@/components/landing/JoinCodeForm";
import { PracticeBankList } from "@/components/practice/PracticeBankList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, SECTION_HEADING_CLASSES } from "@/components/ui/PageHeader";
import type { AttemptProgress } from "@/lib/assignments/assignments";
import type { HistoryRow } from "@/lib/assignments/history";
import { pickUp } from "@/lib/assignments/pickUp";
import { spansWorkspaces, studentClassInfo } from "@/lib/classes/studentClasses";
import { homeSections, stepsHaveAnswers } from "@/lib/learn/homeSections";
import type { LiveHistoryRow } from "@/lib/learn/liveHistory";
import type { StepStandings } from "@/lib/ngn/stepStandings";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import type { StudentClass } from "@/lib/supabase/classInvites";
import type { PracticeBank } from "@/lib/supabase/practice";
import { LiveSessionHistory } from "./LiveSessionHistory";
import { PickUpCard } from "./PickUpCard";

/** What the home shows, as the page read it. `null` is a part that did not load. */
export interface StudentHomeProps {
  classes: readonly StudentClass[] | null;
  assignments: readonly AssignmentSummary[] | null;
  /** This student's attempts per open assignment; absent when the counts did not load. */
  progress?: ReadonlyMap<string, AttemptProgress>;
  practice: readonly PracticeBank[] | null;
  history: readonly HistoryRow[] | null;
  steps: StepStandings | null;
  live: readonly LiveHistoryRow[] | null;
  /** `joinClassWithCode`: the class code form's Server Function. */
  joinClass: JoinByCodeFormProps["action"];
  /** The join code form's Server Function; `openJoinCode` when absent. */
  joinSession?: JoinCodeFormProps["action"];
}

/** A part that did not load: a neutral system message, not feedback red (PLAN D11). */
function DidNotLoad({ children }: { children: ReactNode }) {
  return <Notice>{children}</Notice>;
}

// The section heading every app page shares (#563), with the room this page leaves under it.
const H2 = `mb-3 ${SECTION_HEADING_CLASSES}`;

/** The student's line over the join code field: they are signed in, so no word about accounts. */
export const STUDENT_JOIN_NOTE = "In class now? Enter the join code on the screen.";

/**
 * The student home as it is drawn (#205, #563), from what `src/app/learn/(home)/page.tsx` read:
 * the page reads, this lays out, so the gallery and the tests draw the same thing from fixtures.
 *
 * The one thing a student comes to do in class, join a live session, is the first thing under the
 * title: the landing page's join code form, read by the same rule (`parseJoinCode`) and sent on
 * to `/join/[code]`. Then what to pick up first, then the lists. A list with rows keeps its
 * heading and an empty one is left out (`homeSections`); a student in a class with nothing yet
 * reads one first-use state that says what will appear here. One column on a phone; from 1024px
 * the lists on the left and the steps and the class code on the right.
 */
export function StudentHome({
  classes,
  assignments,
  progress,
  practice,
  history,
  steps,
  live,
  joinClass,
  joinSession,
}: StudentHomeProps) {
  // #242: due times are shown in each class's zone. A student whose classes span more than one
  // workspace also gets the workspace beside each class name, and on each practice quiz.
  const classInfo = studentClassInfo(classes);
  const acrossWorkspaces = spansWorkspaces(classes);
  const pick = pickUp(assignments, progress, practice);
  const inAClass = classes !== null && classes.length > 0;
  const shown = homeSections({
    classes,
    assignments,
    history,
    live,
    practice,
    stepsAnswered: stepsHaveAnswers(steps),
  });

  return (
    <>
      <PageHeader
        title="Your classes"
        lead={inAClass ? <StudentClassList classes={classes} /> : undefined}
      />
      <div className="mt-6 mb-10 max-w-xl rounded-md border border-line bg-surface-1 p-4 sm:p-5">
        <JoinCodeForm
          note={STUDENT_JOIN_NOTE}
          {...(joinSession === undefined ? {} : { action: joinSession })}
        />
      </div>
      {/* #362: no class yet, so the class code is the next thing to do, and comes next. */}
      {classes === null ? (
        <div className="mb-10">
          <DidNotLoad>Your classes did not load. Reload the page.</DidNotLoad>
        </div>
      ) : classes.length === 0 ? (
        <div className="mb-10 flex flex-col gap-6">
          <StudentClassList classes={classes} />
          <section aria-labelledby="join-class-heading">
            <h2 id="join-class-heading" className={H2}>
              Join a class
            </h2>
            <JoinByCodeForm action={joinClass} />
          </section>
        </div>
      ) : null}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          {shown.firstUse ? (
            <EmptyState
              level={2}
              heading="Nothing here yet"
              body="Assignments and practice quizzes from your teacher show here."
            />
          ) : null}
          {pick ? <PickUpCard pick={pick} classes={classInfo} progress={progress} /> : null}
          {shown.assignments ? (
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
          ) : null}
          {shown.history ? (
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
          ) : null}
          {shown.live ? (
            <section aria-labelledby="live-history-heading">
              <h2 id="live-history-heading" className={H2}>
                Live sessions
              </h2>
              {live === null ? (
                <DidNotLoad>Your live sessions did not load. Reload the page.</DidNotLoad>
              ) : (
                <LiveSessionHistory rows={live} classes={classInfo} />
              )}
            </section>
          ) : null}
          {shown.practice ? (
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
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          {shown.steps ? (
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
          ) : null}
          {/* #362: folded away for a student who has classes, where it is an occasional action. */}
          {inAClass ? (
            <div>
              <details>
                <summary className="tap-target inline-flex cursor-pointer items-center rounded-sm font-semibold text-accent-ink underline-offset-4 hover:underline">
                  Join another class
                </summary>
                <div className="mt-3">
                  <JoinByCodeForm action={joinClass} />
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
