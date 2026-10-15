import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  beginAiImportReading,
  checkAiImportFile,
  finishAiImport,
  registerAiImportFile,
  removeAiImportFile,
  startAiImport,
} from "@/app/author/aiImportActions";
import { AiImportUpload } from "@/components/authoring/AiImportUpload";
import { aiImportEnabled } from "@/lib/aiImport/config";
import { workspaceEnabled } from "@/lib/aiImport/upload/access";
import { openBatchId, readAllowance, readBatchView } from "@/lib/aiImport/upload/state";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Import with AI" };

/**
 * Import with AI (#345): upload documents to a quiz and watch them read. Not found while AI
 * import is off for the deployment or the workspace, as the quiz page then shows no link to it.
 */
export default async function AiImportPage({
  params,
  searchParams,
}: PageProps<"/author/banks/[bankId]/ai-import">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();
  const author = await requireAuthor(`/author/banks/${bankId}/ai-import`);
  if (!aiImportEnabled() || (await workspaceEnabled(author)) !== true) notFound();

  const { data: bank } = await author.supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  // Read on the service client, always filtered by the session's workspace: names, statuses
  // and counts only, never a staged question.
  const service = createSupabaseServiceClient();
  const asked = (await searchParams).batch;
  const askedId = typeof asked === "string" && isUuid(asked) ? asked : null;
  const batchId = askedId ?? (await openBatchId(service, author.orgId, bank.id));
  if (batchId === "unavailable") throw new Error("the import could not be read");
  const [view, allowance] = await Promise.all([
    batchId ? readBatchView(service, author.orgId, batchId, bank.id) : null,
    readAllowance(service, author.orgId),
  ]);
  if (view === "unavailable") throw new Error("the import could not be read");
  // Another workspace's batch, or another quiz's, reads as no batch at all.
  const initial = view ?? null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-2">
        <Link href={`/author/banks/${bank.id}`} className="underline hover:text-ink-1">
          {bank.name}
        </Link>
      </nav>
      <h1 className="mb-6 font-read text-3xl break-words text-ink-1">Import with AI</h1>
      <AiImportUpload
        key={initial ? `${initial.id}-${initial.status}` : "new"}
        bankId={bank.id}
        quizName={bank.name}
        allowance={allowance === "unavailable" ? null : allowance}
        initial={initial}
        actions={{
          start: startAiImport,
          register: registerAiImportFile,
          check: checkAiImportFile,
          remove: removeAiImportFile,
          begin: beginAiImportReading,
          finish: finishAiImport,
        }}
      />
    </>
  );
}
