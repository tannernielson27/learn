import { z } from "zod";
import { CASE_STUDY_STEP_COUNT, type EhrRecord, type ItemInput } from "../schemas";
import {
  caseStudyChartsDraftSchema,
  fromCaseStudyDraft,
  patientDraftSchema,
  patientHeaderOf,
  type CaseStudyChartsDraft,
  type CaseStudyConversion,
} from "./caseStudy";
import { chartDraftSchema, DEFAULT_TIME_LABEL, recordFromCharts } from "./chart";
import { needsFix, type DraftReason } from "./common";
import { forStructuredOutput, fromDraft, type ItemDraft, type JsonSchema } from "./items";
import { normalizeLine } from "./text";

/**
 * Assembly (#344, ADR 0008 pipeline step 7): what the extract calls returned, turned into staged
 * entries. Pure: it takes the model's output, never calls it. #343 runs the calls and its
 * validate-and-repair pass, then hands each segment-pass group here:
 *
 * - a case study group (the segment pass gave its questions a case study title): the output of the
 *   call made with `caseStudyChartsJsonSchema()`, and each step's draft in source order. Six steps
 *   make one case study; any other count is staged as standalone questions with a note, as a
 *   course activity with fewer parts is (the Malnutrition sample).
 * - a standalone question: its draft and, for a standalone bowtie or trend with its own chart, the
 *   output of the call made with `standaloneChartJsonSchema()`. That chart becomes the item's own
 *   record (one time point, or one per time its flow sheet shows), never the case study's.
 *
 * Steps are numbered by position only, never by labels the model wrote ("Question 1 of 6" text
 * that is not in the source, ADR 0008 "Structure"). Nothing is reworded or filled in: a mistyped
 * time is kept and noted, a missing patient field is a `needs_fix` reason.
 */

// ---------------------------------------------------------------------------
// Notes: things the reviewer should look at that do not stop the import
// ---------------------------------------------------------------------------

export type AssemblyNoteCode =
  /** The group had a case study title but not six questions, so each is staged on its own. */
  | "not_a_case_study"
  /** A chart printed with a split group belongs to no single question and was not attached. */
  | "chart_not_attached"
  /** The source looks wrong (a time out of order); it is kept word for word for the teacher. */
  | "possible_source_error";

export interface AssemblyNote {
  code: AssemblyNoteCode;
  message: string;
  path?: (string | number)[];
}

// ---------------------------------------------------------------------------
// Times out of order
// ---------------------------------------------------------------------------

const MINUTES_PER_DAY = 24 * 60;
const CLOCK = /^(?:day\s*(\d{1,3})\s*[,:-]?\s*)?([01]\d|2[0-3])[:.h]?([0-5]\d)$/i;
const DAY_ONLY = /^day\s*(\d{1,3})$/i;

interface Clock {
  day?: number;
  minutes?: number;
}

/** A label read as a time of day and/or a day number, or undefined when it is neither. */
export function parseTimeLabel(label: string): Clock | undefined {
  const text = normalizeLine(label);
  const clock = CLOCK.exec(text);
  if (clock) {
    return {
      ...(clock[1] !== undefined ? { day: Number(clock[1]) } : {}),
      minutes: Number(clock[2]) * 60 + Number(clock[3]),
    };
  }
  const day = DAY_ONLY.exec(text);
  return day ? { day: Number(day[1]) } : undefined;
}

/**
 * Whether `next` comes before `previous` when the times are read in order. With day numbers on
 * both, it is a plain comparison. Clock times alone may run past midnight, so a time counts as
 * out of order when reaching it would take more than 12 hours (2300 then 2015, not 2200 then
 * 0100). Undefined when the two cannot be compared.
 */
function goesBack(previous: Clock, next: Clock): boolean | undefined {
  if (previous.day !== undefined && next.day !== undefined) {
    const at = (time: Clock) => time.day! * MINUTES_PER_DAY + (time.minutes ?? 0);
    return at(next) < at(previous);
  }
  if (previous.minutes === undefined || next.minutes === undefined) return undefined;
  const forward = (next.minutes - previous.minutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return forward > MINUTES_PER_DAY / 2;
}

export interface TimeOrderNote {
  index: number;
  label: string;
  message: string;
}

/**
 * Time labels that break the order of those around them, such as a "2015" between 2300 and 0400
 * where the source meant 0200. The label is the source's and stays as it is; this only says where
 * to look. A flagged time is skipped when the next one is compared.
 */
export function timeOrderNotes(labels: readonly string[]): TimeOrderNote[] {
  const notes: TimeOrderNote[] = [];
  let previous: { label: string; time: Clock } | undefined;
  labels.forEach((label, index) => {
    const time = parseTimeLabel(label);
    if (time === undefined) return;
    if (previous !== undefined && goesBack(previous.time, time) === true) {
      notes.push({
        index,
        label,
        message: `The time "${label}" comes after "${previous.label}" but reads as earlier. It is kept as the source prints it; check the source for a typo.`,
      });
      return;
    }
    previous = { label, time };
  });
  return notes;
}

const timeNotesOf = (record: Pick<EhrRecord, "timePoints">): AssemblyNote[] =>
  timeOrderNotes(record.timePoints.map((point) => point.label)).map((note) => ({
    code: "possible_source_error",
    message: note.message,
    path: ["ehr", "timePoints", note.index],
  }));

// ---------------------------------------------------------------------------
// A standalone question's own record
// ---------------------------------------------------------------------------

export const standaloneChartDraftSchema = z.object({
  patient: patientDraftSchema,
  chart: chartDraftSchema.describe(
    "The chart printed with this one question, as the source shows it: every tab, in order.",
  ),
});
export type StandaloneChartDraft = z.infer<typeof standaloneChartDraftSchema>;

/** The JSON Schema for the call that reads a standalone bowtie's or trend's own chart. */
export const standaloneChartJsonSchema = (): JsonSchema =>
  forStructuredOutput(z.toJSONSchema(standaloneChartDraftSchema)) as JsonSchema;

type RecordInput = Omit<EhrRecord, "patientHeader"> & {
  patientHeader: Partial<EhrRecord["patientHeader"]>;
};

export interface StandaloneRecord {
  /** Shaped like `standaloneEhrRecordSchema`; may not pass it while a reason says why. */
  record: RecordInput;
  reasons: DraftReason[];
  notes: AssemblyNote[];
}

/** Table headings (after the first) that read as times, in the chart's order, each once. */
function headingTimes(record: Pick<EhrRecord, "tabs">): string[] {
  const seen = new Set<string>();
  return record.tabs.flatMap((tab) =>
    tab.blocks.flatMap((block) =>
      block.kind !== "table"
        ? []
        : block.columns.slice(1).filter((heading) => {
            const key = heading.toLowerCase();
            if (parseTimeLabel(heading) === undefined || seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
    ),
  );
}

/**
 * A standalone item's record from its one chart. It has no steps, so nothing carries `fromStep`
 * or `stepAccess`, and a tab the source shows empty is left out (with the converter's reason).
 * Its time points are the times its tabs are charted at; failing those, a trend's flow sheet
 * headings (0800, 1200, 1600), so the time selector shows the times the source does.
 */
export function standaloneRecordFrom(draft: StandaloneChartDraft): StandaloneRecord {
  const patient = patientHeaderOf(draft.patient);
  const merged = recordFromCharts([draft.chart]);
  const fellBack =
    merged.timePoints.length === 1 &&
    merged.timePoints[0].label === DEFAULT_TIME_LABEL &&
    merged.tabs.every((tab) => tab.timePointId === undefined);
  const headings = fellBack ? headingTimes(merged) : [];
  const timePoints =
    headings.length > 0
      ? headings.map((label, index) => ({ id: `tp_${index + 1}`, label }))
      : merged.timePoints;
  const record: RecordInput = {
    patientHeader: patient.header,
    timePoints,
    tabs: merged.tabs,
  };
  const chartReasons = merged.reasons.map((reason) => ({
    ...reason,
    path: ["chart", ...(reason.path ?? []).slice(2)],
  }));
  return {
    record,
    reasons: [...patient.reasons, ...chartReasons],
    notes: timeNotesOf(record),
  };
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface AssemblyContext {
  /** The entry's id. A case study's step N is `<id>_step_N`; a split group's question N is `<id>_q_N`. */
  id: string;
  tags?: string[];
}

interface EntryBase {
  /** Why the entry is not ready as it stands (see `DraftReasonCode`); #343 turns these into a status. */
  reasons: DraftReason[];
  /** For the reviewer only; they never change the status. */
  notes: AssemblyNote[];
  /** The case study group the entry came from (`ai_import_entries.group_key`), at most 80 characters. */
  groupKey?: string;
}

export interface AssembledItem extends EntryBase {
  kind: "item";
  /** Shaped like the type's item input; may not pass `itemSchema` while a reason says why. */
  item: ItemInput;
  /** The question's place in its group (`ai_import_entries.step`), when it came from one. */
  step?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface AssembledCaseStudy extends EntryBase {
  kind: "case_study";
  caseStudy: CaseStudyConversion["caseStudy"];
  groupKey: string;
}

export type AssembledEntry = AssembledItem | AssembledCaseStudy;

export interface CaseStudyGroup {
  /** The title the segment pass grouped the questions under. */
  title: string;
  /** The output of the call made with `caseStudyChartsJsonSchema()`, as returned. */
  charts: unknown;
  /**
   * Each question's draft, in the source's order, after #343's repair attempt. A question whose
   * extract failed outright is left out (and staged by #343 on its own), so the group is short.
   */
  steps: ItemDraft[];
}

export interface StandaloneQuestion {
  draft: ItemDraft;
  /** The output of the call made with `standaloneChartJsonSchema()`, when the question has its own chart. */
  chart?: unknown;
}

const GROUP_KEY_LENGTH = 80;

const groupKeyOf = (title: string, fallback: string): string =>
  (normalizeLine(title) || fallback).slice(0, GROUP_KEY_LENGTH);

const hasChart = (charts: CaseStudyChartsDraft | undefined): boolean =>
  charts?.charts.some((chart) => chart.tabs.some((tab) => tab.sections.length > 0)) ?? false;

const withTags = (tags: string[] | undefined) => (tags !== undefined ? { tags } : {});

function splitGroup(
  group: CaseStudyGroup,
  charts: CaseStudyChartsDraft | undefined,
  context: AssemblyContext,
  groupKey: string,
): AssembledItem[] {
  const count = group.steps.length;
  const notes: AssemblyNote[] = [
    {
      code: "not_a_case_study",
      message: `This came from "${groupKey}", which has ${count} questions; a case study has ${CASE_STUDY_STEP_COUNT}, so each question is staged on its own.`,
    },
    ...(hasChart(charts)
      ? [
          {
            code: "chart_not_attached" as const,
            message: "The chart printed with these questions was not attached to any of them.",
          },
        ]
      : []),
  ];
  return group.steps.map((draft, index) => {
    const { item, reasons } = fromDraft(draft, {
      id: `${context.id}_q_${index + 1}`,
      ...withTags(context.tags),
    });
    return {
      kind: "item",
      item: item as ItemInput,
      reasons,
      notes: notes.map((note) => ({ ...note })),
      groupKey,
      ...(index < CASE_STUDY_STEP_COUNT ? { step: (index + 1) as AssembledItem["step"] } : {}),
    };
  });
}

/**
 * One segment-pass case study group as staged entries: one case study when it has six questions,
 * otherwise each question on its own. The case study's record carries `fromStep` (and
 * `stepAccess` where the source shows it) from `recordFromCharts`, so `recordAtStep` shows each
 * step only what its source did.
 */
export function assembleCaseStudy(
  group: CaseStudyGroup,
  context: AssemblyContext,
): AssembledEntry[] {
  const parsed = caseStudyChartsDraftSchema.safeParse(group.charts);
  const charts = parsed.success ? parsed.data : undefined;
  const groupKey = groupKeyOf(group.title, context.id);
  if (group.steps.length !== CASE_STUDY_STEP_COUNT) {
    return splitGroup(group, charts, context, groupKey);
  }
  const title = normalizeLine(charts?.title ?? "") || normalizeLine(group.title);
  const converted = fromCaseStudyDraft(
    {
      title,
      patient: charts?.patient ?? {},
      charts: charts?.charts ?? [],
      steps: group.steps,
    },
    { id: context.id, ...withTags(context.tags) },
  );
  const unread: DraftReason[] = parsed.success
    ? []
    : [needsFix("The chart could not be read, so the case study has none yet.", ["charts"])];
  return [
    {
      kind: "case_study",
      caseStudy: converted.caseStudy,
      reasons: [...unread, ...converted.reasons],
      notes: timeNotesOf(converted.caseStudy.ehr),
      groupKey,
    },
  ];
}

/** A standalone question as a staged entry, with its own record when it has a chart. */
export function assembleQuestion(
  question: StandaloneQuestion,
  context: AssemblyContext,
): AssembledItem {
  const converted = fromDraft(question.draft, { id: context.id, ...withTags(context.tags) });
  const item = converted.item as ItemInput;
  if (question.chart === undefined) {
    return { kind: "item", item, reasons: converted.reasons, notes: [] };
  }
  const chart = standaloneChartDraftSchema.safeParse(question.chart);
  if (!chart.success) {
    return {
      kind: "item",
      item,
      reasons: [
        ...converted.reasons,
        needsFix("The question's chart could not be read, so it has none yet.", ["chart"]),
      ],
      notes: [],
    };
  }
  const own = standaloneRecordFrom(chart.data);
  return {
    kind: "item",
    item: { ...item, ehr: own.record as EhrRecord },
    reasons: [...converted.reasons, ...own.reasons],
    notes: own.notes,
  };
}

// ---------------------------------------------------------------------------
// A whole file
// ---------------------------------------------------------------------------

export type ImportPart =
  ({ kind: "question" } & StandaloneQuestion) | ({ kind: "case_study" } & CaseStudyGroup);

/** What the source says about itself. It belongs to the batch, never to an item. */
export interface SourceMatter {
  author?: string;
  objectives?: string[];
  references?: string[];
}

export interface AssembledImport {
  entries: AssembledEntry[];
  source: { author?: string; objectives: string[]; references: string[] };
}

export interface AssembleImportOptions {
  /** Entry N's id is `<idPrefix>_N`. Letters, digits, `_` and `-`, at most 40. Default `ai_import`. */
  idPrefix?: string;
  tags?: string[];
  source?: SourceMatter;
}

const ID_PREFIX = /^[A-Za-z0-9_-]{1,40}$/;

const lines = (values: readonly string[] | undefined): string[] =>
  (values ?? []).map(normalizeLine).filter((value) => value !== "");

/**
 * A file's segment-pass groups, in the source's order, as staged entries in that order. The
 * author, objectives and references come back as `source`, for the batch.
 */
export function assembleImport(
  parts: readonly ImportPart[],
  options: AssembleImportOptions = {},
): AssembledImport {
  const prefix = options.idPrefix ?? "ai_import";
  if (!ID_PREFIX.test(prefix)) {
    throw new RangeError(`idPrefix "${prefix}" must be 1–40 letters, digits, "_" or "-".`);
  }
  const entries = parts.flatMap((part, index): AssembledEntry[] => {
    const context = { id: `${prefix}_${index + 1}`, ...withTags(options.tags) };
    return part.kind === "case_study"
      ? assembleCaseStudy(part, context)
      : [assembleQuestion(part, context)];
  });
  const author = normalizeLine(options.source?.author ?? "");
  return {
    entries,
    source: {
      ...(author !== "" ? { author } : {}),
      objectives: lines(options.source?.objectives),
      references: lines(options.source?.references),
    },
  };
}
