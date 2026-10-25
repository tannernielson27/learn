import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentProgressView } from "@/components/classes/progress/StudentProgressView";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classStudentPath } from "@/lib/classes/classes";
import { buildClassProgress } from "@/lib/classes/progress";
import { studentProgress } from "@/lib/classes/studentProgress";
import { readClassProgress } from "@/lib/supabase/classProgress";
import { readClass } from "@/lib/supabase/classes";

export const metadata: Metadata = { title: "Student" };

/**
 * One student's progress in one class, for the class's teacher. The class is read under row level
 * security and the progress through `class_progress`, which answers only a teacher of the class's
 * own workspace; a class they cannot see, or a student who is not (and was never) in it, is
 * not-found, exactly like an id that does not exist. A malformed id is not-found before the
 * author check, so it costs no auth round trip. A student or an account with no role never
 * gets this far: `requireAuthor` sends them home.
 */
export default async function ClassStudentPage({
  params,
}: PageProps<"/author/classes/[classId]/students/[profileId]">) {
  const { classId, profileId } = await params;
  if (!isUuid(classId) || !isUuid(profileId)) notFound();
  const { supabase } = await requireAuthor(classStudentPath(classId, profileId));

  const detail = await readClass(supabase, classId);
  if (!detail) notFound();
  const progress = studentProgress(
    buildClassProgress(await readClassProgress(supabase, classId)),
    profileId,
  );
  if (!progress) notFound();

  return <StudentProgressView classId={detail.id} className={detail.name} progress={progress} />;
}
