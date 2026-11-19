import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { saveAiImportEntryFix } from "@/app/author/aiImportFixActions";
import { AiImportEntryEditor } from "@/components/authoring/AiImportEntryEditor";
import { editorFor } from "@/components/authoring/editorFor";
import { Breadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { aiImportEnabled } from "@/lib/aiImport/config";
import { readFixEntry } from "@/lib/aiImport/review/fixRead";
import type { Client } from "@/lib/aiImport/upload/access";
import { workspaceEnabled } from "@/lib/aiImport/upload/access";
import { editHref, parseReviewFilter, reviewHref } from "@/lib/authoring/aiImportReview";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";

export const metadata: Metadata = { title: "Edit imported question" };

/** `?step=3`: a case study's step, from 1 to 6. Anything else is no step. */
function parseStep(value: unknown): number | undefined | "invalid" {
  if (value === undefined) return undefined;
  const step = typeof value === "string" && /^[1-6]$/.test(value) ? Number(value) : null;
  return step ?? "invalid";
}

/**
 * Fix one staged AI import question with its type's editor (#347). A teacher of the batch's
 * workspace only, as on the review page: read with the teacher's own session (RLS) and filtered by
 * the session's workspace and the quiz in the address. A dropped question or one with no NGN type
 * has no editor here: not found.
 *
 * Since #593 `?step=` opens one step of a staged case study the same way, and `?show=` carries the
 * review's filter, so the way back and "next" keep the place the teacher came from.
 */
export default async function AiImportEntryPage({
  params,
  searchParams,
}: PageProps<"/author/banks/[bankId]/ai-import/[batchId]/[entryId]">) {
  const { bankId, batchId, entryId } = await params;
  const query = await searchParams;
  const step = parseStep(query.step);
  if (!isUuid(bankId) || !isUuid(batchId) || !isUuid(entryId) || step === "invalid") notFound();
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
    step,
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
  const filter = parseReviewFilter(query.show);
  const base = `/author/banks/${bank.id}/ai-import/${batchId}`;
  const backHref = reviewHref(base, filter, entry.id);
  const heading = entry.caseStudy
    ? `step ${entry.caseStudy.step} of 6 in ${entry.caseStudy.title}`
    : `Question ${entry.number}`;

  // Wide: the question's editor and its preview are two panes, as on the question page.
  return (
    <>
      <Breadcrumbs
        // Guarded: a crumb is a way out, and the form may hold unsaved work (#593).
        guarded
        crumbs={[
          { label: bank.name, href: `/author/banks/${bank.id}` },
          { label: "Review AI import", href: backHref },
        ]}
      />
      <AiImportEntryEditor
        // One editor per question or step: its form must not carry over to the next one.
        key={`${entry.id}:${entry.caseStudy?.step ?? 0}`}
        batchId={batchId}
        entryId={entry.id}
        version={entry.version}
        heading={heading}
        status={entry.status}
        reasons={entry.reasons}
        sourceExcerpt={entry.sourceExcerpt}
        sourcePages={entry.sourcePages}
        fileName={entry.fileName}
        reviewHref={backHref}
        nextHref={entry.next ? editHref(base, entry.next.entryId, filter, entry.next.step) : null}
        caseStep={
          entry.caseStudy
            ? { step: entry.caseStudy.step, record: entry.caseStudy.record }
            : undefined
        }
        editor={editor}
        save={saveAiImportEntryFix}
      />
    </>
  );
}
