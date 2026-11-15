import type { Metadata } from "next";
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
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";

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
      {page.kind === "failed" ? (
        <>
          <p className="mb-4">
            <BackLink href={STUDENT_HOME}>Back to your classes</BackLink>
          </p>
          <Notice role="alert">This practice did not load. Reload the page.</Notice>
        </>
      ) : (
        <>
          <PageHeader
            className="mb-6"
            back={{ href: STUDENT_HOME, label: "Back to your classes" }}
            title={page.view.bankName}
            lead={<p className="text-base">Practice</p>}
          />
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
