import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignmentPath } from "@/lib/assignments/assignments";
import { publishCaseStudyAction } from "@/app/author/case-studies/[caseStudyId]/actions";
import { archiveCaseStudyAction, restoreCaseStudyAction } from "@/app/author/archiveActions";
import { duplicateCaseStudyAction } from "@/app/author/duplicateActions";
import { startCaseStudyLiveSession } from "@/app/live/actions";
import {
  assembleCaseStudy,
  CASE_STUDY_WITH_STEPS,
  caseStudyStepStates,
} from "@/lib/authoring/caseStudies";
import {
  CaseStudyBuilder,
  type BuilderStep,
  type StepStatus,
} from "@/components/authoring/CaseStudyBuilder";
import { ArchiveButton } from "@/components/authoring/ArchiveButton";
import { DuplicateButton } from "@/components/authoring/DuplicateButton";
import { EhrEditorLoader } from "@/components/authoring/EhrEditorLoader";
import { editorFor, storedItemOf } from "@/components/authoring/editorFor";
import { ItemEditorLoader } from "@/components/authoring/ItemEditorLoader";
import { StepItemPanel } from "@/components/authoring/StepItemPanel";
import { StepTypeChooser } from "@/components/authoring/StepTypeChooser";
import { Button } from "@/components/ui/Button";
import { caseStudyBlockers, stepsReadyLabel } from "@/lib/authoring/caseStudyReadiness";
import { ehrFormFromStored, previewRecord } from "@/lib/authoring/forms/ehr";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { caseStudyLiveStartMessage } from "@/lib/live/liveStart";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";

export const metadata: Metadata = { title: "Case study" };

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;
const POSITIONS: readonly CjmmStep[] = [1, 2, 3, 4, 5, 6];

export default async function CaseStudyPage({
  params,
  searchParams,
}: PageProps<"/author/case-studies/[caseStudyId]">) {
  const { caseStudyId } = await params;
  // Why a live session could not start, carried back by startCaseStudyLiveSession (#184).
  const liveRefusal = caseStudyLiveStartMessage((await searchParams).live);
  if (!isUuid(caseStudyId)) notFound();

  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  // Authors may read their own org's keys (ADR 0003): each step's editor needs them.
  const { data: row } = await supabase
    .from("case_studies")
    .select(CASE_STUDY_WITH_STEPS)
    .eq("id", caseStudyId)
    .maybeSingle();
  if (!row) notFound();

  // The rail and the blockers describe publishing, so a step is ready once it is published and
  // carries the rationale publishing now needs.
  const stepStates = caseStudyStepStates(row, "publish");

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

  // Assembled once: it drives both Preview case study and whether Export JSON is offered.
  const preview = assembleCaseStudy(row, "preview");

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
        preview={preview}
        publish={publishCaseStudyAction.bind(null, row.id)}
      >
        <p className="eyebrow mb-1">Case study</p>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h1 className="font-read text-3xl text-ink-1">{row.title}</h1>
          <p className="text-sm text-ink-2">{STATUS_LABELS[row.status]}</p>
          {/* Only a case study with its record and six finished steps exports. */}
          {preview.ok ? (
            <a
              href={`/author/case-studies/${row.id}/export`}
              download
              className="text-sm text-accent-ink underline-offset-4 hover:underline"
            >
              Export JSON
            </a>
          ) : null}
          <DuplicateButton
            action={duplicateCaseStudyAction.bind(null, row.id)}
            label="Duplicate case study"
          />
          {/* Only a published case study can be run: start_session refuses anything else (#184). */}
          {row.status === "published" ? (
            <form action={startCaseStudyLiveSession.bind(null, row.id)}>
              <Button type="submit" variant="secondary" size="sm">
                Start a live session
              </Button>
            </form>
          ) : null}
          {/* #207: only a published case study can be assigned, as only one can be run. */}
          {row.status === "published" ? (
            <Link
              href={assignmentPath({ kind: "case_study", id: row.id })}
              className="tap-target inline-flex items-center rounded-sm border border-line bg-surface-1 px-3 text-sm font-medium text-ink-1 hover:border-line-strong hover:bg-surface-2"
            >
              Assign
            </Link>
          ) : null}
          {row.status === "archived" ? (
            <ArchiveButton
              action={restoreCaseStudyAction.bind(null, row.id)}
              label="Restore case study"
            />
          ) : (
            <ArchiveButton
              action={archiveCaseStudyAction.bind(null, row.id)}
              label="Archive case study"
            />
          )}
        </div>
        {liveRefusal ? (
          <p role="alert" className="mb-6 text-sm text-incorrect">
            {liveRefusal}
          </p>
        ) : null}
        {row.status === "archived" ? (
          <p className="mb-6 max-w-prose rounded-sm border border-line bg-surface-2 p-3 text-ink-1">
            This case study is archived. It is out of the bank&apos;s list, and its record, its
            steps and their order cannot change until it is restored.
          </p>
        ) : null}
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
