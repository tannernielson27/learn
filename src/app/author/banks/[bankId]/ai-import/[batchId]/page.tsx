import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  discardAiImportBatch,
  dropAiImportEntries,
  dropAiImportEntry,
  importAiImportBatch,
  restoreAiImportEntry,
  splitAiImportCaseStudy,
} from "@/app/author/aiImportActions";
import { answerNotes, importedSentence, parseReviewFilter } from "@/lib/authoring/aiImportReview";
import { AiImportReview } from "@/components/authoring/AiImportReview";
import { Breadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { Card } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import { aiImportEnabled } from "@/lib/ai/config";
import { readReviewBatch } from "@/lib/aiImport/review/read";
import type { Client } from "@/lib/aiImport/upload/access";
import { workspaceEnabled } from "@/lib/aiImport/upload/access";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";

export const metadata: Metadata = { title: "Review AI import" };

/**
 * Review an AI import batch (#346). A teacher of the batch's workspace only: everything is read
 * with the teacher's own session (RLS) and filtered by the session's workspace and the quiz in
 * the address. Another workspace's batch, another quiz's, or AI import off: not found. A batch
 * still reading goes back to the upload page, which carries on with it.
 *
 * `?show=` names the status filter (#593), so a reload, or Back from a question's editor, opens
 * the list as the teacher left it.
 */
export default async function AiImportReviewPage({
  params,
  searchParams,
}: PageProps<"/author/banks/[bankId]/ai-import/[batchId]">) {
  const { bankId, batchId } = await params;
  const { show } = await searchParams;
  if (!isUuid(bankId) || !isUuid(batchId)) notFound();
  const author = await requireAuthor(`/author/banks/${bankId}/ai-import/${batchId}`);
  if (!aiImportEnabled() || (await workspaceEnabled(author)) !== true) notFound();

  const { data: bank } = await author.supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  const batch = await readReviewBatch(
    author.supabase as unknown as Client,
    author.orgId,
    batchId,
    bank.id,
  );
  if (batch === "unavailable") throw new Error("the import could not be read");
  if (!batch) notFound();
  if (batch.status === "uploading" || batch.status === "parsing") {
    redirect(`/author/banks/${bank.id}/ai-import?batch=${batch.id}`);
  }
  if (batch.status === "imported") {
    // #348: the batch keeps its counts after the import; its entries and files are gone.
    const { data: done } = await author.supabase
      .from("ai_import_batches")
      .select("imported_questions, imported_case_studies")
      .eq("id", batch.id)
      .eq("org_id", author.orgId)
      .maybeSingle();
    return (
      <ReadingWidth>
        <PageHeader title="AI import" className="mb-6" />
        <section className="sm:max-w-2xl">
          <Card className="flex flex-col items-start gap-3">
            <h2 className="font-read text-2xl text-ink-1">Imported</h2>
            <p className="text-ink-1" data-testid="imported-summary">
              {importedSentence(
                done?.imported_questions ?? 0,
                done?.imported_case_studies ?? 0,
                bank.name,
              )}{" "}
              The uploaded files have been deleted.
            </p>
            <TextLink href={`/author/banks/${bank.id}`}>Open {bank.name}</TextLink>
            {/* #593: the imported questions are drafts, so the quiz's own filter finds them. */}
            <TextLink href={`/author/banks/${bank.id}?status=draft`}>
              Show its draft questions
            </TextLink>
          </Card>
        </section>
      </ReadingWidth>
    );
  }
  if (batch.status !== "review") notFound();

  // Wide: each question's preview and its source sit side by side on a laptop (PLAN §6).
  return (
    <>
      <Breadcrumbs
        crumbs={[
          { label: bank.name, href: `/author/banks/${bank.id}` },
          { label: "Import with AI", href: `/author/banks/${bank.id}/ai-import?batch=${batch.id}` },
        ]}
      />
      <PageHeader title="Review AI import" className="mb-6" />
      <AiImportReview
        bankId={bank.id}
        quizName={bank.name}
        batchId={batch.id}
        fileNames={batch.fileNames}
        entries={batch.entries}
        initialFilter={parseReviewFilter(show)}
        // #592: answers that reached no question, said beside what blocks the import.
        notes={answerNotes(batch.answers)}
        actions={{
          drop: dropAiImportEntry,
          restore: restoreAiImportEntry,
          importBatch: importAiImportBatch,
          discard: discardAiImportBatch,
          dropAll: dropAiImportEntries,
          split: splitAiImportCaseStudy,
        }}
      />
    </>
  );
}
