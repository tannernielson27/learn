import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PracticePlayer } from "@/components/practice/PracticePlayer";
import { Notice } from "@/components/ui/Notice";
import { PageWidth } from "@/components/ui/PageWidth";
import { isUuid } from "@/lib/authoring/ids";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { requireStudent } from "@/lib/classes/viewer";
import { loadPracticePage } from "@/lib/practice/page";
import { practicePageStore } from "@/lib/practice/store";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { practiseMissedFromRunAction } from "../missed/actions";
import { startPracticeOverAction } from "./actions";

export const metadata: Metadata = { title: "Practice" };

/**
 * A student practising one shared bank (#241). Everything is decided on the server by
 * `loadPracticePage`: whether the bank is shared with a class this student is a current member of
 * (a 404 if not, or if it no longer is), their current run, and its items, keyless, with the key
 * of only those items this run has answered. The page renders that view and adds nothing.
 *
 * At the wide content width (PLAN §6): the patient record and the question side by side, and the
 * results' two columns, need more than the reading column.
 */
export default async function PracticePage({ params }: PageProps<"/learn/practice/[bankId]">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();

  const { userId } = await requireStudent();
  const page = await loadPracticePage(
    practicePageStore(createSupabaseServiceClient()),
    userId,
    bankId,
  );
  if (page.kind === "missing") notFound();

  return (
    <PageWidth width="wide">
      <p className="mb-2 text-sm text-ink-2">
        <Link href={STUDENT_HOME} className="tap-target inline-flex items-center hover:text-ink-1">
          Your classes
        </Link>
      </p>
      <p className="eyebrow mb-2">Practice</p>
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
            startOver={startPracticeOverAction.bind(null, bankId)}
            practiseMissed={practiseMissedFromRunAction.bind(null, page.view.runId)}
          />
        </>
      )}
    </PageWidth>
  );
}
