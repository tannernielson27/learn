import type { ReactNode } from "react";
import { AssignmentList, type AssignmentListProps } from "@/components/assignments/AssignmentList";
import { PracticeSection } from "@/components/practice/PracticeSection";
import type { PracticeShareFormProps } from "@/components/practice/PracticeShareForm";
import { Notice } from "@/components/ui/Notice";
import { classStartPath } from "@/lib/classes/classes";
import { summarizeClass } from "@/lib/classes/classOverview";
import type { ClassProgress, ProgressSort } from "@/lib/classes/progress";
import type { ClassTab } from "@/lib/classes/classTabs";
import { stopSharingWarning } from "@/lib/practice/shares";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import type { ClassDetail, RosterEntry } from "@/lib/supabase/classes";
import type { ShareEntry } from "@/lib/supabase/practiceShares";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import { ClassHeader } from "./ClassHeader";
import { ClassNameForm, type ClassNameFormProps } from "./ClassNameForm";
import { ClassOverviewPanel } from "./ClassOverviewPanel";
import { ClassRoster } from "./ClassRoster";
import { ClassTabPanel } from "./ClassTabPanel";
import { ClassTabs } from "./ClassTabs";
import { ClassTimeZoneForm } from "./ClassTimeZoneForm";
import type { ConfirmSubmitProps } from "./ConfirmSubmit";
import { ReplaceInviteLink } from "./InviteLinkPanel";
import { ClassProgressPanel } from "./progress/ClassProgressPanel";
import { ClassSessionsPanel } from "./progress/ClassSessionsPanel";

/** The Server Functions the class page's forms call, each already bound to this class. */
export interface ClassPageActions {
  rename: ClassNameFormProps["action"];
  setTimeZone: ClassNameFormProps["action"];
  rotateInvite: ConfirmSubmitProps["action"];
  removeStudentFor: (profileId: string) => ConfirmSubmitProps["action"];
  editAssignmentFor: AssignmentListProps["editActionFor"];
  deleteAssignmentFor: AssignmentListProps["deleteActionFor"];
  share: PracticeShareFormProps["action"];
  stopSharingFor: (bankId: string) => ConfirmSubmitProps["action"];
}

export interface ClassPageViewProps {
  detail: ClassDetail;
  /** The absolute invite URL. */
  url: string;
  /** Each list as the page read it; null when it could not be read. */
  roster: readonly RosterEntry[] | null;
  assignments: readonly AssignmentSummary[] | null;
  shares: readonly ShareEntry[] | null;
  /** The share form's choices; null hides the form. */
  banks: readonly { id: string; name: string }[] | null;
  /** The class's progress, read on the Progress tab only; null when unread or unreadable. */
  progress?: ClassProgress | null;
  /** How the Progress tab's grid is sorted, from the address. */
  progressSort?: ProgressSort;
  /** The class's live sessions, read on the Live sessions tab only. */
  sessions?: readonly SessionSummary[] | null;
  /** The time zones offered, worked out on the server so hydration matches. */
  zones: readonly string[];
  /** When the page was rendered: decides each assignment's state. */
  now: Date;
  tab: ClassTab;
  actions: ClassPageActions;
}

const HEADING = "text-lg font-medium text-ink-1";

/**
 * One class (#205): a header with its name, its size, its class code (#356) and its invite link,
 * then its parts as tabs kept in the address (`classTabs.ts`). Overview summarises; Students is
 * the roster; Progress is each student across the class's live sessions and assignments; Live
 * sessions lists the sessions started for the class (ADR 0013); Assignments holds the assignments
 * and the practice shares (#240); Settings holds the name, the time zone (#242) and replacing the
 * invite link. Only the open tab is drawn.
 *
 * Each part keeps the sections, headings and focus targets it had when the page was one column,
 * so their forms behave as they did: only where they sit has changed.
 */
export function ClassPageView({
  detail,
  url,
  roster,
  assignments,
  shares,
  banks,
  progress = null,
  progressSort = "name",
  sessions = null,
  zones,
  now,
  tab,
  actions,
}: ClassPageViewProps) {
  // Keyed by every tab, so a new tab in CLASS_TABS does not type-check until it has a panel here.
  const panels: Record<ClassTab, () => ReactNode> = {
    overview: () => (
      <ClassOverviewPanel
        classId={detail.id}
        classTitle={detail.name}
        url={url}
        overview={summarizeClass({ roster, assignments, shares, now })}
      />
    ),

    students: () => (
      <section aria-labelledby="roster-heading" className="max-w-reading">
        {/* Focusable from script only: a confirmed remove sends focus here (#272). */}
        <h2 id="roster-heading" tabIndex={-1} className={`mb-3 ${HEADING}`}>
          Roster
        </h2>
        {roster === null ? (
          <Notice role="alert">
            The roster could not be loaded. Reload the page to try again.
          </Notice>
        ) : (
          <ClassRoster
            entries={roster}
            removeActionFor={actions.removeStudentFor}
            // The link is in the header, on this page.
            emptyAction={{ href: "#invite-link", label: "Go to the invite link" }}
            focusAfterRemove="roster-heading"
          />
        )}
      </section>
    ),

    progress: () => (
      <ClassProgressPanel classId={detail.id} progress={progress} sort={progressSort} />
    ),

    sessions: () => <ClassSessionsPanel classId={detail.id} sessions={sessions} />,

    assignments: () => (
      // Two columns from 1024px: the assignments, and the quizzes shared for practice beside them.
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        <section aria-labelledby="assignments-heading" className="min-w-0">
          {/* Focusable from script only: a confirmed Delete sends focus here (#288). */}
          <h2 id="assignments-heading" tabIndex={-1} className={`mb-3 ${HEADING}`}>
            Assignments
          </h2>
          {assignments === null ? (
            <Notice role="alert">
              The assignments could not be loaded. Reload the page to try again.
            </Notice>
          ) : (
            <AssignmentList
              assignments={assignments}
              now={now}
              editActionFor={actions.editAssignmentFor}
              deleteActionFor={actions.deleteAssignmentFor}
              focusAfterDelete="assignments-heading"
            />
          )}
        </section>
        <div className="min-w-0">
          <PracticeSection
            headingClassName={HEADING}
            shares={shares}
            options={banks}
            list={{
              label: "Quizzes shared for practice",
              stopActionFor: actions.stopSharingFor,
              stopLabelFor: (entry) => `Stop sharing ${entry.name}`,
              warningFor: (entry) => stopSharingWarning(detail.name, entry.name),
              emptyMessage: "No quiz is shared with this class.",
            }}
            form={{
              action: actions.share,
              label: "Quiz",
              emptyMessage:
                banks && banks.length === 0
                  ? "No quizzes to share yet."
                  : "Every quiz is shared with this class.",
            }}
          />
        </div>
      </div>
    ),

    settings: () => (
      <div className="flex max-w-reading flex-col gap-10">
        <section aria-labelledby="rename-heading">
          <h2 id="rename-heading" className={`mb-3 ${HEADING}`}>
            Rename
          </h2>
          <ClassNameForm
            action={actions.rename}
            initialName={detail.name}
            submitLabel="Rename class"
          />
        </section>

        <section aria-labelledby="time-zone-heading" className="border-t border-line pt-6">
          <h2 id="time-zone-heading" className={`mb-3 ${HEADING}`}>
            Time zone
          </h2>
          <ClassTimeZoneForm
            action={actions.setTimeZone}
            currentZone={detail.timeZone}
            zones={zones}
          />
        </section>

        <section aria-labelledby="replace-heading" className="border-t border-line pt-6">
          <h2 id="replace-heading" className={`mb-3 ${HEADING}`}>
            Replace the invite link
          </h2>
          <p className="mb-4 max-w-prose text-ink-2">
            If the link or the class code has gone somewhere it should not, replace both. Students
            already in the class stay in it.
          </p>
          <ReplaceInviteLink rotateAction={actions.rotateInvite} />
        </section>
      </div>
    ),
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ClassHeader
        name={detail.name}
        studentCount={roster === null ? null : roster.length}
        url={url}
        code={detail.joinCode}
        startHref={classStartPath(detail.id)}
      />
      <div className="flex flex-col gap-6 sm:gap-8">
        <ClassTabs classId={detail.id} current={tab} />
        <ClassTabPanel tab={tab}>{panels[tab]()}</ClassTabPanel>
      </div>
    </div>
  );
}
