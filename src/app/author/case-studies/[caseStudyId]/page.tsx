import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { caseStudyBlockers, stepsReadyLabel } from "@/lib/authoring/caseStudyReadiness";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import type { CjmmStep } from "@/lib/ngn/types";
import { fromItemRow } from "@/lib/supabase/itemRows";

export const metadata: Metadata = { title: "Case study" };

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;
const linkClass = "text-accent-ink underline-offset-4 hover:underline";

export default async function CaseStudyPage({
  params,
}: PageProps<"/author/case-studies/[caseStudyId]">) {
  const { caseStudyId } = await params;
  if (!isUuid(caseStudyId)) notFound();

  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  // Keys are read only to decide whether each step's item is valid; nothing but the verdict is
  // rendered. The embed names the org keys, since the migration adds a second key pair.
  const { data: row } = await supabase
    .from("case_studies")
    .select(
      "id, bank_id, title, status, ehr, case_study_items!case_study_items_case_org_fkey (position, item_id, items!case_study_items_item_org_fkey (type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring))",
    )
    .eq("id", caseStudyId)
    .maybeSingle();
  if (!row) notFound();

  const steps = row.case_study_items.map((step) => ({
    position: step.position as CjmmStep,
    itemId: step.item_id,
    itemReady: Boolean(
      step.items && step.items.status === "published" && fromItemRow(step.items).ok,
    ),
    wrongStep: Boolean(step.items && step.items.cjmm_step !== step.position),
  }));
  const record = row.ehr as { tabs?: unknown[] } | null;
  const blockers = caseStudyBlockers({
    titleWritten: row.title.trim().length > 0,
    recordTabCount: Array.isArray(record?.tabs) ? record.tabs.length : 0,
    steps,
  });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/author/banks/${row.bank_id}`} className={linkClass}>
          Back to bank
        </Link>
      </p>
      <p className="eyebrow mb-1">Case study</p>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="font-read text-3xl text-ink-1">{row.title}</h1>
        <p className="text-sm text-ink-2">{STATUS_LABELS[row.status]}</p>
      </div>
      <p className="mb-4 text-ink-1">{stepsReadyLabel(steps)}</p>
      {blockers.length > 0 ? (
        <section aria-labelledby="blockers-heading" className="rounded-sm border border-line p-4">
          <h2 id="blockers-heading" className="mb-2 text-sm font-medium text-ink-1">
            Before this case study can be published
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-1">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-ink-1">Every step is ready to publish.</p>
      )}
    </>
  );
}
