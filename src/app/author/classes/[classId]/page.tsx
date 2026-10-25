import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { deleteAssignment, editAssignment } from "@/app/author/assignments/actions";
import { ClassPageView } from "@/components/classes/ClassPageView";
import { shareClassWithBank, stopSharing } from "@/app/author/practice/actions";
import { listBanks } from "@/lib/authoring/banks";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { inviteUrl } from "@/lib/classes/classes";
import { buildClassProgress, parseProgressSort } from "@/lib/classes/progress";
import { classTabPath, classTabReads, parseClassTab } from "@/lib/classes/classTabs";
import { supportedTimeZones, timeZoneChoices } from "@/lib/classes/timeZone";
import { canonicalSiteOrigin } from "@/lib/http/siteOrigin";
import { listClassAssignments } from "@/lib/supabase/assignments";
import { listClassSessions, readClassProgress } from "@/lib/supabase/classProgress";
import { classRoster, readClass } from "@/lib/supabase/classes";
import { listClassShares } from "@/lib/supabase/practiceShares";
import { removeStudent, renameClass, rotateInvite, setTimeZone } from "../actions";

export const metadata: Metadata = { title: "Class" };

/**
 * One class: its name, its invite link and QR code, its roster (#205), its time zone (#242) and its
 * class code (#356), drawn by `ClassPageView` as a header and tabs. The open tab is `?tab=`
 * (`classTabs.ts`). Only the open tab is drawn, so only what it and the header need is read
 * (`classTabReads`); a list left unread is passed as null, which only an unread tab would show.
 * Progress keeps its sort in the address too (`?tab=progress&sort=overall`).
 */
export default async function ClassPage({
  params,
  searchParams,
}: PageProps<"/author/classes/[classId]">) {
  const { classId } = await params;
  const query = await searchParams;
  const tab = parseClassTab(query.tab);
  const { supabase } = await requireAuthor(classTabPath(classId, tab));
  if (!isUuid(classId)) notFound();

  const detail = await readClass(supabase, classId);
  if (!detail) notFound();
  const reads = classTabReads(tab);
  const [roster, assignments, shares, banks, progress, sessions] = await Promise.all([
    reads.has("roster") ? classRoster(supabase, classId) : null,
    reads.has("assignments") ? listClassAssignments(supabase, classId) : null,
    reads.has("shares") ? listClassShares(supabase, classId) : null,
    // The share form's choices; a failed read hides the form rather than failing the page.
    reads.has("banks") ? listBanks(supabase).catch(() => null) : null,
    // The class's own teacher only (class_progress); a failed read is the tab's notice.
    reads.has("progress")
      ? readClassProgress(supabase, classId)
          .then(buildClassProgress)
          .catch((error: unknown) => {
            console.error("[class-progress] could not read a class's progress", {
              classId,
              message: error instanceof Error ? error.message : String(error),
            });
            return null;
          })
      : null,
    reads.has("sessions") ? listClassSessions(supabase, classId) : null,
  ]);
  const url = inviteUrl(canonicalSiteOrigin(await headers()), detail.inviteToken);

  return (
    <ClassPageView
      detail={detail}
      url={url}
      roster={roster}
      assignments={assignments}
      shares={shares}
      banks={banks}
      progress={progress}
      progressSort={parseProgressSort(query.sort)}
      sessions={sessions}
      zones={timeZoneChoices(supportedTimeZones(), detail.timeZone)}
      now={new Date()}
      tab={tab}
      actions={{
        rename: renameClass.bind(null, detail.id),
        setTimeZone: setTimeZone.bind(null, detail.id),
        rotateInvite: rotateInvite.bind(null, detail.id),
        removeStudentFor: (profileId) => removeStudent.bind(null, detail.id, profileId),
        editAssignmentFor: (assignmentId, closeOnly) =>
          editAssignment.bind(null, detail.id, assignmentId, closeOnly),
        deleteAssignmentFor: (assignmentId) => deleteAssignment.bind(null, detail.id, assignmentId),
        share: shareClassWithBank.bind(null, detail.id),
        stopSharingFor: (bankId) => stopSharing.bind(null, bankId, detail.id),
      }}
    />
  );
}
