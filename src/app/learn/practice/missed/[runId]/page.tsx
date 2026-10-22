import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PracticePlayer } from "@/components/practice/PracticePlayer";
import { Notice } from "@/components/ui/Notice";
import { PageWidth } from "@/components/ui/PageWidth";
import { studentResultsPath } from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { requireStudent } from "@/lib/classes/viewer";
import { loadMissedPracticePage } from "@/lib/practice/page";
import { practicePath } from "@/lib/practice/paths";
import { missedPageStore } from "@/lib/practice/store";
import type { MissedSource } from "@/lib/supabase/practiceMissed";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { practiseMissedFromRunAction } from "../actions";

export const metadata: Metadata = { title: "Practice" };

/** Where the run came from, and so where its student goes back to. */
function backOf(source: MissedSource): { href: string; label: string } {
  return source.kind === "assignment"
    ? { href: studentResultsPath(source.id), label: "Back to your results" }
    : { href: practicePath(source.bankId), label: "Back to the practice quiz" };
}

/**
 * A practice run of only the questions a student missed (owner decision 6), made from their own
 * practice run or their released assignment results. `loadMissedPracticePage` decides everything
 * on the server: the run must be the student's own missed run with its source still open to them
 * (a 404 otherwise), and its questions arrive keyless, with the key of only those it has answered.
 * Practice is never graded.
 */
export default async function MissedPracticePage({
  params,
}: PageProps<"/learn/practice/missed/[runId]">) {
  const { runId } = await params;
  if (!isUuid(runId)) notFound();

  const { userId } = await requireStudent();
  const page = await loadMissedPracticePage(
    missedPageStore(createSupabaseServiceClient()),
    userId,
    runId,
  );
  if (page.kind === "missing") notFound();

  return (
    <PageWidth width="wide">
      <p className="mb-2 text-sm text-ink-2">
        <Link href={STUDENT_HOME} className="tap-target inline-flex items-center hover:text-ink-1">
          Your classes
        </Link>
      </p>
      <p className="eyebrow mb-2">Practice: the questions you missed</p>
      {page.kind === "failed" ? (
        <Notice role="alert">This practice did not load. Reload the page.</Notice>
      ) : (
        <>
          <h1 className="mb-6 font-read text-display leading-tight break-words text-ink-1">
            {page.view.bankName}
          </h1>
          <PracticePlayer
            key={page.view.runId}
            view={page.view}
            practiseMissed={practiseMissedFromRunAction.bind(null, page.view.runId)}
            back={backOf(page.source)}
          />
        </>
      )}
    </PageWidth>
  );
}
