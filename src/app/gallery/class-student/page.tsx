import { notFound } from "next/navigation";
import { StudentProgressView } from "@/components/classes/progress/StudentProgressView";
import { CLASS_PAGE_FIXTURE_CLASS } from "@/lib/classes/classPageFixture";
import { PROGRESS_FIXTURE } from "@/lib/classes/classProgressFixture";
import { buildClassProgress } from "@/lib/classes/progress";
import { studentProgress } from "@/lib/classes/studentProgress";

/** Kai, the class fixture's lowest overall: a missed live session and weak steps to show. */
const STUDENT = "00000000-0000-4000-8000-0000000000a2";

/**
 * One student's progress (`/author/classes/[classId]/students/[profileId]`) drawn from
 * `classProgressFixture.ts`, with no database behind it, so the screenshot suite covers its
 * layout. Opened by URL, not from the gallery nav, like `/gallery/class-page`. Nothing here
 * carries an answer key, and every name is fictional.
 */
export default function ClassStudentGallery() {
  const progress = studentProgress(buildClassProgress(PROGRESS_FIXTURE), STUDENT);
  if (!progress) notFound();
  return (
    <article>
      <p className="eyebrow">Composites</p>
      <p className="mt-2 text-2xl font-semibold">Student progress</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        One student of the class page&apos;s class, across its live sessions and assignments.
      </p>
      <div data-testid="class-student-demo">
        <StudentProgressView
          classId={CLASS_PAGE_FIXTURE_CLASS.id}
          className={CLASS_PAGE_FIXTURE_CLASS.name}
          progress={progress}
        />
      </div>
    </article>
  );
}
