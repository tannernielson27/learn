import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveAiImportEntryFix } from "@/app/author/aiImportFixActions";
import { AiImportEntryEditor } from "@/components/authoring/AiImportEntryEditor";
import { editorFor } from "@/components/authoring/editorFor";
import { aiImportEnabled } from "@/lib/aiImport/config";
import { readFixEntry } from "@/lib/aiImport/review/fix";
import type { Client } from "@/lib/aiImport/upload/access";
import { workspaceEnabled } from "@/lib/aiImport/upload/access";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";

export const metadata: Metadata = { title: "Edit imported question" };

/**
 * Fix one staged AI import question with its type's editor (#347). A teacher of the batch's
 * workspace only, as on the review page: read with the teacher's own session (RLS) and filtered by
 * the session's workspace and the quiz in the address. A case study, a dropped question or one
 * with no NGN type has no editor here: not found.
 */
export default async function AiImportEntryPage({
  params,
}: PageProps<"/author/banks/[bankId]/ai-import/[batchId]/[entryId]">) {
  const { bankId, batchId, entryId } = await params;
  if (!isUuid(bankId) || !isUuid(batchId) || !isUuid(entryId)) notFound();
  const author = await requireAuthor(`/author/banks/${bankId}/ai-import/${batchId}/${entryId}`);
  if (!aiImportEnabled() || (await workspaceEnabled(author)) !== true) notFound();

  const { data: bank } = await author.supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  const read = await readFixEntry(author.supabase as unknown as Client, author.orgId, {
    bankId: bank.id,
    batchId,
    entryId,
  });
  if (read === "unavailable") throw new Error("the question could not be read");
  if (!read) notFound();
  if (read.batchStatus === "uploading" || read.batchStatus === "parsing") {
    redirect(`/author/banks/${bank.id}/ai-import?batch=${batchId}`);
  }
  if (read.batchStatus !== "review" || !read.entry) notFound();
  const { entry } = read;
  const editor = editorFor(entry.id, entry.type, entry.start);
  if (!editor) notFound();
  const reviewHref = `/author/banks/${bank.id}/ai-import/${batchId}`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-sm text-ink-2">
        <Link href={`/author/banks/${bank.id}`} className="underline hover:text-ink-1">
          {bank.name}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={reviewHref} className="underline hover:text-ink-1">
          Review AI import
        </Link>
      </nav>
      <AiImportEntryEditor
        batchId={batchId}
        entryId={entry.id}
        version={entry.version}
        heading={`Question ${entry.number}`}
        status={entry.status}
        reasons={entry.reasons}
        sourceExcerpt={entry.sourceExcerpt}
        reviewHref={reviewHref}
        editor={editor}
        save={saveAiImportEntryFix}
      />
    </>
  );
}
