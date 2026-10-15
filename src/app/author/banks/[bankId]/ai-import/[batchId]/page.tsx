import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  discardAiImportBatch,
  dropAiImportEntry,
  importAiImportBatch,
  restoreAiImportEntry,
} from "@/app/author/aiImportActions";
import { importedSentence } from "@/lib/authoring/aiImportReview";
import { AiImportReview } from "@/components/authoring/AiImportReview";
import { aiImportEnabled } from "@/lib/aiImport/config";
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
 */
export default async function AiImportReviewPage({
  params,
}: PageProps<"/author/banks/[bankId]/ai-import/[batchId]">) {
  const { bankId, batchId } = await params;
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
      <>
        <h1 className="mb-6 font-read text-3xl break-words text-ink-1">AI import</h1>
        <section className="flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4 sm:max-w-2xl">
          <h2 className="font-read text-2xl text-ink-1">Imported</h2>
          <p className="text-ink-1" data-testid="imported-summary">
            {importedSentence(
              done?.imported_questions ?? 0,
              done?.imported_case_studies ?? 0,
              bank.name,
            )}{" "}
            The uploaded files have been deleted.
          </p>
          <Link
            href={`/author/banks/${bank.id}`}
            className="tap-target inline-flex items-center text-accent-ink underline"
          >
            Open {bank.name}
          </Link>
        </section>
      </>
    );
  }
  if (batch.status !== "review") notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm text-ink-2">
        <Link href={`/author/banks/${bank.id}`} className="underline hover:text-ink-1">
          {bank.name}
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/author/banks/${bank.id}/ai-import?batch=${batch.id}`}
          className="underline hover:text-ink-1"
        >
          Import with AI
        </Link>
      </nav>
      <h1 className="mb-6 font-read text-3xl break-words text-ink-1">Review AI import</h1>
      <AiImportReview
        bankId={bank.id}
        quizName={bank.name}
        batchId={batch.id}
        fileNames={batch.fileNames}
        entries={batch.entries}
        actions={{
          drop: dropAiImportEntry,
          restore: restoreAiImportEntry,
          importBatch: importAiImportBatch,
          discard: discardAiImportBatch,
        }}
      />
    </>
  );
}
