import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publishCaseStudyAction } from "@/app/author/case-studies/[caseStudyId]/actions";
import { assembleCaseStudy } from "@/lib/authoring/caseStudies";
import {
  CaseStudyBuilder,
  type BuilderStep,
  type StepStatus,
} from "@/components/authoring/CaseStudyBuilder";
import { EhrEditorLoader } from "@/components/authoring/EhrEditorLoader";
import { editorFor, storedItemOf } from "@/components/authoring/editorFor";
import { ItemEditorLoader } from "@/components/authoring/ItemEditorLoader";
import { StepItemPanel } from "@/components/authoring/StepItemPanel";
import { StepTypeChooser } from "@/components/authoring/StepTypeChooser";
import {
  caseStudyBlockers,
  stepsReadyLabel,
  type CaseStudyStepState,
} from "@/lib/authoring/caseStudyReadiness";
import { ehrFormFromStored, previewRecord } from "@/lib/authoring/forms/ehr";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";
import { fromItemRow } from "@/lib/supabase/itemRows";

export const metadata: Metadata = { title: "Case study" };

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;
const POSITIONS: readonly CjmmStep[] = [1, 2, 3, 4, 5, 6];

export default async function CaseStudyPage({
  params,
}: PageProps<"/author/case-studies/[caseStudyId]">) {
  const { caseStudyId } = await params;
  if (!isUuid(caseStudyId)) notFound();

  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  // Authors may read their own org's keys (ADR 0003): each step's editor needs them. The embed
  // names the org keys, since the steps migration adds a second key pair.
  const { data: row } = await supabase
    .from("case_studies")
    .select(
      "id, bank_id, title, tags, status, ehr, case_study_items!case_study_items_case_org_fkey (position, item_id, items!case_study_items_item_org_fkey (id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring))",
    )
    .eq("id", caseStudyId)
    .maybeSingle();
  if (!row) notFound();

  const stepStates: CaseStudyStepState[] = row.case_study_items.map((step) => ({
    position: step.position as CjmmStep,
    itemId: step.item_id,
    itemReady: Boolean(
      step.items && step.items.status === "published" && fromItemRow(step.items).ok,
    ),
    wrongStep: Boolean(step.items && step.items.cjmm_step !== step.position),
  }));

  const recordForm = ehrFormFromStored(row.ehr);
  const recordValid = ehrRecordSchema.safeParse(row.ehr).success;
  const recordStarted =
    recordForm.tabs.length > 0 || recordForm.patient.age !== "" || recordForm.patient.sex !== "";
  const recordStatus: StepStatus = recordValid ? "ready" : recordStarted ? "draft" : "empty";

  const steps: BuilderStep[] = POSITIONS.map((position) => {
    const item = row.case_study_items.find((step) => step.position === position)?.items;
    if (!item) {
      return {
        position,
        status: "empty",
        panel: <StepTypeChooser caseStudyId={row.id} position={position} />,
      };
    }
    const state = stepStates.find((step) => step.position === position);
    const status: StepStatus = state?.itemReady
      ? state.wrongStep
        ? "attention"
        : "ready"
      : state?.wrongStep || item.status === "published"
        ? "attention"
        : "draft";
    const editor = editorFor(item.id, item.type, storedItemOf(item));
    const typeLabel = (ITEM_TYPES as readonly string[]).includes(item.type)
      ? ITEM_TYPE_LABELS[item.type as ItemType]
      : item.type;
    return {
      position,
      status,
      panel: (
        // Keyed by item, so a new item after a type change opens with the panel reset.
        <StepItemPanel key={item.id} caseStudyId={row.id} position={position} typeLabel={typeLabel}>
          {editor ? (
            <ItemEditorLoader {...editor} />
          ) : (
            <p className="text-ink-2">This item&apos;s type cannot be edited here.</p>
          )}
        </StepItemPanel>
      ),
    };
  });

  const blockers = caseStudyBlockers({
    titleWritten: row.title.trim().length > 0,
    recordTabCount: recordForm.tabs.length,
    steps: stepStates,
  });

  return (
    <>
      <CaseStudyBuilder
        back={{ href: `/author/banks/${row.bank_id}`, label: "Back to bank" }}
        record={{
          status: recordStatus,
          panel: <EhrEditorLoader caseStudyId={row.id} initialValues={recordForm} />,
        }}
        steps={steps}
        readyLabel={stepsReadyLabel(stepStates)}
        recordPreview={previewRecord(recordForm)}
        preview={assembleCaseStudy(row, "preview")}
        publish={publishCaseStudyAction.bind(null, row.id)}
      >
        <p className="eyebrow mb-1">Case study</p>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h1 className="font-read text-3xl text-ink-1">{row.title}</h1>
          <p className="text-sm text-ink-2">{STATUS_LABELS[row.status]}</p>
        </div>
      </CaseStudyBuilder>

      {blockers.length > 0 ? (
        <section
          aria-labelledby="blockers-heading"
          className="mt-8 rounded-sm border border-line p-4"
        >
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
        <p className="mt-8 text-ink-1">Every step is ready to publish.</p>
      )}
    </>
  );
}
