import { z } from "zod";
import { recordAtStep, type EhrBlockView } from "../chartReveal";
import {
  CASE_STUDY_STEP_COUNT,
  type CaseStudy,
  type caseStudySchema,
  type EhrRecord,
  type ItemOf,
} from "../schemas";
import {
  chartDraftSchema,
  recordFromCharts,
  type ChartDraft,
  type ChartSectionDraft,
} from "./chart";
import { DEFAULT_DRAFT_ITEM_ID, needsFix, type DraftContext, type DraftReason } from "./common";
import {
  forStructuredOutput,
  fromDraft,
  itemDraftSchema,
  toDraft,
  type DraftType,
  type ItemDraft,
  type JsonSchema,
} from "./items";
import { normalizeLine } from "./text";

/**
 * A case study draft (#338): its title, the patient header, the chart as the source shows it with
 * each step, and each step's question. #344 fills the first three in one call and each step in
 * its own, then converts the whole with `fromCaseStudyDraft`. Step numbers and the clinical
 * judgment step come from the position, never from the model.
 */

const SOURCE_ONLY = "Leave it out when the source does not print it. Never write one yourself.";

export const patientDraftSchema = z.object({
  name: z.string().optional().describe(`The patient's name. ${SOURCE_ONLY}`),
  age: z.string().optional().describe(`The age as printed, such as "29". ${SOURCE_ONLY}`),
  sex: z.string().optional().describe(`The sex or gender as printed. ${SOURCE_ONLY}`),
  setting: z
    .string()
    .optional()
    .describe(`Where the patient is cared for, such as "Emergency department". ${SOURCE_ONLY}`),
  admissionDate: z
    .string()
    .optional()
    .describe(`The admission date or day as printed. ${SOURCE_ONLY}`),
});
export type PatientDraft = z.infer<typeof patientDraftSchema>;

export const caseStudyChartsDraftSchema = z.object({
  title: z.string().describe("The case study's title, word for word."),
  patient: patientDraftSchema,
  charts: z
    .array(chartDraftSchema)
    .describe(
      "The chart with each step, step 1 first: one entry per step, even where it repeats the step before.",
    ),
});
export type CaseStudyChartsDraft = z.infer<typeof caseStudyChartsDraftSchema>;

export const caseStudyDraftSchema = caseStudyChartsDraftSchema.extend({
  steps: z.array(itemDraftSchema).describe("Each step's question, step 1 first."),
});
export type CaseStudyDraft = z.infer<typeof caseStudyDraftSchema>;

/** The JSON Schema for the case study call: title, patient header and charts, no questions. */
export const caseStudyChartsJsonSchema = (): JsonSchema =>
  forStructuredOutput(z.toJSONSchema(caseStudyChartsDraftSchema)) as JsonSchema;

export interface CaseStudyDraftContext {
  /** The case study's id; step N's item is `<id>_step_N`. */
  id?: string;
  tags?: string[];
}

type CaseStudyInput = z.input<typeof caseStudySchema>;

/**
 * A converted case study. Like `DraftConversion`, it may not pass `caseStudySchema` while it has
 * a `needs_answer` or `needs_fix` reason.
 */
export interface CaseStudyConversion {
  caseStudy: CaseStudyInput;
  reasons: DraftReason[];
}

const SEXES: [RegExp, EhrRecord["patientHeader"]["sex"]][] = [
  [/^(?:f|female|woman|girl)\b/i, "female"],
  [/^(?:m|male|man|boy)\b/i, "male"],
];

/** The patient header the source gives; a field it leaves out is flagged, never filled in. */
export function patientHeaderOf(patient: PatientDraft): {
  header: EhrRecord["patientHeader"];
  reasons: DraftReason[];
} {
  const reasons: DraftReason[] = [];
  const text = (value: string | undefined) => (value === undefined ? "" : normalizeLine(value));
  const age = /\d{1,3}/.exec(text(patient.age));
  if (!age || Number(age[0]) > 120) {
    reasons.push(needsFix("The source gives no age the chart can use.", ["patient", "age"]));
  }
  const sexText = text(patient.sex);
  const sex =
    sexText === "" ? undefined : (SEXES.find(([pattern]) => pattern.test(sexText))?.[1] ?? "other");
  if (sex === undefined) reasons.push(needsFix("The source gives no sex.", ["patient", "sex"]));
  const setting = text(patient.setting);
  if (setting === "") {
    reasons.push(needsFix("The source names no care setting.", ["patient", "setting"]));
  }
  const name = text(patient.name);
  const admissionDate = text(patient.admissionDate);
  // A field the source does not give is left out rather than filled in; the reason says so, and
  // the record will not pass its schema until the teacher adds it.
  const header = {
    ...(name !== "" ? { name } : {}),
    ...(age && Number(age[0]) <= 120 ? { age: Number(age[0]) } : {}),
    ...(sex !== undefined ? { sex } : {}),
    ...(setting !== "" ? { setting } : {}),
    ...(admissionDate !== "" ? { admissionDate } : {}),
  } as EhrRecord["patientHeader"];
  return { header, reasons };
}

const countReason = (what: string, count: number, path: string): DraftReason[] =>
  count === CASE_STUDY_STEP_COUNT
    ? []
    : [
        needsFix(
          `The source has ${count} ${what}; a case study has ${CASE_STUDY_STEP_COUNT}.${count > CASE_STUDY_STEP_COUNT ? " Those past the sixth were left out." : ""}`,
          [path],
        ),
      ];

export function fromCaseStudyDraft(
  draft: CaseStudyDraft,
  context: CaseStudyDraftContext = {},
): CaseStudyConversion {
  const id = context.id ?? DEFAULT_DRAFT_ITEM_ID;
  const patient = patientHeaderOf(draft.patient);
  const chart = recordFromCharts(draft.charts);
  const steps = draft.steps.slice(0, CASE_STUDY_STEP_COUNT).map((step, index) =>
    fromDraft(step, {
      id: `${id}_step_${index + 1}`,
      cjmmStep: (index + 1) as DraftContext["cjmmStep"],
    }),
  );
  const stepReasons = steps.flatMap(({ reasons }, index) =>
    reasons.map((reason) => ({ ...reason, path: ["steps", index, ...(reason.path ?? [])] })),
  );
  return {
    caseStudy: {
      id,
      title: normalizeLine(draft.title),
      ...(context.tags !== undefined ? { tags: [...context.tags] } : {}),
      ehr: { patientHeader: patient.header, timePoints: chart.timePoints, tabs: chart.tabs },
      items: steps.map(({ item }) => item),
    },
    reasons: [
      ...countReason("charts", draft.charts.length, "charts"),
      ...countReason("steps", draft.steps.length, "steps"),
      ...patient.reasons,
      ...chart.reasons,
      ...stepReasons,
    ],
  };
}

function sectionOf(block: EhrBlockView): ChartSectionDraft {
  if (block.kind === "markdown") return { kind: "text", text: block.value };
  if (block.kind === "table") {
    return { kind: "table", columns: [...block.columns], rows: block.rows.map((row) => [...row]) };
  }
  return { kind: "values", rows: block.rows.map((row) => ({ ...row })) };
}

/** The charts a case study's source would print: the record as each step shows it. */
export function chartsOf(record: EhrRecord): ChartDraft[] {
  const labels = new Map(record.timePoints.map((point) => [point.id, point.label]));
  return Array.from({ length: CASE_STUDY_STEP_COUNT }, (_, index) => ({
    tabs: recordAtStep(record, (index + 1) as Parameters<typeof recordAtStep>[1]).tabs.map(
      (tab) => {
        const time = tab.timePointId === undefined ? undefined : labels.get(tab.timePointId);
        return {
          title: tab.title,
          ...(time !== undefined ? { time } : {}),
          sections: "locked" in tab ? [] : tab.blocks.map(sectionOf),
        };
      },
    ),
  }));
}

/** The draft a valid case study would come from. Used by round-trip tests. */
export function toCaseStudyDraft(caseStudy: CaseStudy): CaseStudyDraft {
  const header = caseStudy.ehr.patientHeader;
  return {
    title: caseStudy.title,
    patient: {
      ...(header.name !== undefined ? { name: header.name } : {}),
      age: String(header.age),
      sex: header.sex,
      setting: header.setting,
      ...(header.admissionDate !== undefined ? { admissionDate: header.admissionDate } : {}),
    },
    charts: chartsOf(caseStudy.ehr),
    steps: caseStudy.items.map((item) => toDraft(item as ItemOf<DraftType>) as ItemDraft),
  };
}
