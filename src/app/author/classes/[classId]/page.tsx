import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { deleteAssignment, editAssignment } from "@/app/author/assignments/actions";
import { AssignmentList } from "@/components/assignments/AssignmentList";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { ClassNameForm } from "@/components/classes/ClassNameForm";
import { ClassRoster } from "@/components/classes/ClassRoster";
import { ClassTimeZoneForm } from "@/components/classes/ClassTimeZoneForm";
import { InviteLinkPanel } from "@/components/classes/InviteLinkPanel";
import { PracticeSection } from "@/components/practice/PracticeSection";
import { Notice } from "@/components/ui/Notice";
import { shareClassWithBank, stopSharing } from "@/app/author/practice/actions";
import { listBanks } from "@/lib/authoring/banks";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classPath, inviteUrl } from "@/lib/classes/classes";
import { supportedTimeZones, timeZoneChoices } from "@/lib/classes/timeZone";
import { canonicalSiteOrigin } from "@/lib/http/siteOrigin";
import { stopSharingWarning } from "@/lib/practice/shares";
import { listClassAssignments } from "@/lib/supabase/assignments";
import { classRoster, readClass } from "@/lib/supabase/classes";
import { listClassShares } from "@/lib/supabase/practiceShares";
import { removeStudent, renameClass, rotateInvite, setTimeZone } from "../actions";

export const metadata: Metadata = { title: "Class" };

/**
 * One class: its name, its invite link and QR code, its roster (#205), its time zone (#242) and its
 * class code (#356).
 */
export default async function ClassPage({ params }: PageProps<"/author/classes/[classId]">) {
  const { classId } = await params;
  const { supabase } = await requireAuthor(classPath(classId));
  if (!isUuid(classId)) notFound();

  const detail = await readClass(supabase, classId);
  if (!detail) notFound();
  const [roster, assignments, shares, banks] = await Promise.all([
    classRoster(supabase, classId),
    listClassAssignments(supabase, classId),
    listClassShares(supabase, classId),
    // The share form's choices; a failed read hides the form rather than failing the page.
    listBanks(supabase).catch(() => null),
  ]);
  const url = inviteUrl(canonicalSiteOrigin(await headers()), detail.inviteToken);

  return (
    // One column: the roster and the assignments are lists of lines, not tables (PLAN §6).
    <ReadingWidth>
      {/* The way back to every class is the layout's navigation (#412). */}
      <h1 className="mb-6 font-read text-3xl break-words text-ink-1">{detail.name}</h1>

      <section aria-labelledby="invite-heading" className="mb-10">
        <h2 id="invite-heading" className="mb-2 text-lg font-medium text-ink-1">
          Invite students
        </h2>
        <p className="mb-4 max-w-prose text-ink-2">
          Anyone with the link or the class code can join. Share them with your class only.
        </p>
        <InviteLinkPanel
          url={url}
          code={detail.joinCode}
          classTitle={detail.name}
          rotateAction={rotateInvite.bind(null, detail.id)}
        />
      </section>

      <section aria-labelledby="assignments-heading" className="mb-10">
        {/* Focusable from script only: a confirmed Delete sends focus here (#288). */}
        <h2 id="assignments-heading" tabIndex={-1} className="mb-3 text-lg font-medium text-ink-1">
          Assignments
        </h2>
        {assignments === null ? (
          <Notice role="alert">
            The assignments could not be loaded. Reload the page to try again.
          </Notice>
        ) : (
          <AssignmentList
            assignments={assignments}
            now={new Date()}
            editActionFor={(assignmentId, closeOnly) =>
              editAssignment.bind(null, detail.id, assignmentId, closeOnly)
            }
            deleteActionFor={(assignmentId) => deleteAssignment.bind(null, detail.id, assignmentId)}
            focusAfterDelete="assignments-heading"
          />
        )}
      </section>

      <div className="mb-10">
        <PracticeSection
          headingClassName="text-lg font-medium text-ink-1"
          intro="The class sees each answer and rationale as it practices a shared quiz."
          shares={shares}
          options={banks}
          list={{
            label: "Quizzes shared for practice",
            stopActionFor: (bankId) => stopSharing.bind(null, bankId, detail.id),
            stopLabelFor: (entry) => `Stop sharing ${entry.name}`,
            warningFor: (entry) => stopSharingWarning(detail.name, entry.name),
            emptyMessage: "No quiz is shared with this class.",
          }}
          form={{
            action: shareClassWithBank.bind(null, detail.id),
            label: "Quiz",
            emptyMessage:
              banks && banks.length === 0
                ? "No quizzes to share yet."
                : "Every quiz is shared with this class.",
          }}
        />
      </div>

      <section aria-labelledby="roster-heading" className="mb-10">
        {/* Focusable from script only: a confirmed remove sends focus here (#272). */}
        <h2 id="roster-heading" tabIndex={-1} className="mb-3 text-lg font-medium text-ink-1">
          Roster
        </h2>
        {roster === null ? (
          <Notice role="alert">
            The roster could not be loaded. Reload the page to try again.
          </Notice>
        ) : (
          <ClassRoster
            entries={roster}
            removeActionFor={(profileId) => removeStudent.bind(null, detail.id, profileId)}
            emptyAction={{ href: "#invite-heading", label: "Go to the invite link" }}
            focusAfterRemove="roster-heading"
          />
        )}
      </section>

      <section aria-labelledby="time-zone-heading" className="mb-10 border-t border-line pt-6">
        <h2 id="time-zone-heading" className="mb-3 text-lg font-medium text-ink-1">
          Time zone
        </h2>
        <ClassTimeZoneForm
          action={setTimeZone.bind(null, detail.id)}
          currentZone={detail.timeZone}
          zones={timeZoneChoices(supportedTimeZones(), detail.timeZone)}
        />
      </section>

      <section aria-labelledby="rename-heading" className="border-t border-line pt-6">
        <h2 id="rename-heading" className="mb-3 text-lg font-medium text-ink-1">
          Rename
        </h2>
        <ClassNameForm
          action={renameClass.bind(null, detail.id)}
          initialName={detail.name}
          submitLabel="Rename class"
        />
      </section>
    </ReadingWidth>
  );
}
