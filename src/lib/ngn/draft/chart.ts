import { z } from "zod";
import {
  CASE_STUDY_STEP_COUNT,
  type EhrBlock,
  type EhrRecord,
  type EhrTab,
  type TabAccess,
} from "../schemas";
import { needsFix, type DraftReason } from "./common";
import { normalizeLine, normalizeMarkdown } from "./text";

/**
 * A case study's chart, step by step (#338, ADR 0008). Sources repeat the whole chart with each
 * step and add to it as the case unfolds; the model copies each step's chart as it stands, and
 * `recordFromCharts` merges them into one record whose parts carry `fromStep` (and, where the
 * source shows a tab's name with nothing in it, `stepAccess`), so `recordAtStep` shows each step
 * what its source did.
 */

const COPY = "Copy it word for word.";

export const chartSectionDraftSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      text: z
        .string()
        .describe(
          `Notes or other prose, as markdown. ${COPY} Put each timed note or entry in its own paragraph.`,
        ),
    }),
    z.object({
      kind: z.literal("table"),
      columns: z
        .array(z.string())
        .describe(`The headings, left to right; an empty string for an empty heading. ${COPY}`),
      rows: z
        .array(z.array(z.string()).describe(`One row's cells, left to right. ${COPY}`))
        .describe("Every row, top to bottom."),
    }),
    z.object({
      kind: z.literal("values"),
      rows: z
        .array(
          z.object({
            label: z.string().describe('What was measured, such as "Hemoglobin".'),
            value: z.string().describe("The result as printed, without its unit."),
            unit: z.string().optional().describe("The unit, when the source prints one."),
            flag: z
              .enum(["H", "L"])
              .optional()
              .describe("H or L, only when the source flags the result high or low."),
          }),
        )
        .describe("A list of results, one per line of the source."),
    }),
  ])
  .describe("One part of a tab: prose, a table, or a list of results.");
export type ChartSectionDraft = z.infer<typeof chartSectionDraftSchema>;

export const chartTabDraftSchema = z.object({
  title: z.string().describe(`The tab's name, such as "Nurses' Notes". ${COPY}`),
  time: z
    .string()
    .optional()
    .describe(
      "The time the source charts the whole tab at, such as a note headed 0130, only when it names one.",
    ),
  sections: z
    .array(chartSectionDraftSchema)
    .describe(
      "What the tab holds, top to bottom. Leave it empty when the source shows the tab's name with nothing in it.",
    ),
});
export type ChartTabDraft = z.infer<typeof chartTabDraftSchema>;

export const chartDraftSchema = z
  .object({ tabs: z.array(chartTabDraftSchema).describe("Every tab, in the source's order.") })
  .describe(
    "The chart exactly as the source shows it with this step: every tab, including what it repeats from the step before.",
  );
export type ChartDraft = z.infer<typeof chartDraftSchema>;

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type Path = (string | number)[];

interface TableRowAcc {
  fromStep: Step;
  cells: Map<string, string>;
}

type BlockAcc =
  | { kind: "markdown"; fromStep: Step; value: string }
  | {
      kind: "table";
      fromStep: Step;
      columns: string[];
      headings: Map<string, string>;
      columnFrom: Map<string, Step>;
      rowOrder: string[];
      rows: Map<string, TableRowAcc>;
    }
  | {
      kind: "values";
      rowOrder: string[];
      rows: Map<string, { fromStep: Step; row: ValuesRow }>;
    };

type ValuesRow = Extract<EhrBlock, { kind: "vitals" }>["rows"][number];

interface TabAcc {
  title: string;
  time: string | undefined;
  presence: ("absent" | "locked" | "open")[];
  blockOrder: string[];
  blocks: Map<string, BlockAcc>;
}

interface MergeState {
  tabOrder: string[];
  tabs: Map<string, TabAcc>;
  timeOrder: string[];
  timeFirstSeen: Map<string, Step>;
  tabTimes: Set<string>;
  reasons: DraftReason[];
}

/** `existing` with the keys of `incoming` it lacks, each placed after the key before it. */
export function mergeOrdered(existing: readonly string[], incoming: readonly string[]): string[] {
  const result = [...existing];
  let anchor = -1;
  for (const key of incoming) {
    const at = result.indexOf(key);
    if (at >= 0) {
      anchor = at;
      continue;
    }
    result.splice(anchor + 1, 0, key);
    anchor += 1;
  }
  return result;
}

const keyOf = (text: string): string => normalizeLine(text).toLowerCase();

function seeTime(state: MergeState, label: string, step: Step) {
  if (label === "" || state.timeFirstSeen.has(keyOf(label))) return;
  state.timeFirstSeen.set(keyOf(label), step);
}

/** Column keys for one table: a heading, numbered when it repeats. */
function columnKeys(columns: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((heading) => {
    const base = keyOf(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}

function mergeTable(
  acc: Extract<BlockAcc, { kind: "table" }>,
  section: Extract<ChartSectionDraft, { kind: "table" }>,
  step: Step,
  state: MergeState,
  path: Path,
) {
  const width = Math.max(section.columns.length, ...section.rows.map((row) => row.length));
  const headings = Array.from({ length: width }, (_, index) =>
    normalizeLine(section.columns[index] ?? ""),
  );
  const keys = columnKeys(headings);
  keys.forEach((key, index) => {
    if (!acc.headings.has(key)) acc.headings.set(key, headings[index]);
    if (!acc.columnFrom.has(key)) acc.columnFrom.set(key, step);
  });
  acc.columns = mergeOrdered(acc.columns, keys);
  const rowKeys = section.rows.map((row) => {
    const cells = row.map(normalizeLine);
    const rowKey = cells[0] ? keyOf(cells[0]) : `#${cells.join("|").toLowerCase()}`;
    const existing = acc.rows.get(rowKey);
    if (!existing) {
      acc.rows.set(rowKey, {
        fromStep: step,
        cells: new Map(keys.map((key, index) => [key, cells[index] ?? ""])),
      });
      return rowKey;
    }
    keys.forEach((key, index) => {
      const before = existing.cells.get(key) ?? "";
      const now = cells[index] ?? "";
      if (before === "" || now === "" || before === now) {
        if (before === "") existing.cells.set(key, now);
        return;
      }
      state.reasons.push(
        needsFix(
          `Step ${step}'s chart shows "${now}" for ${cells[0] || "a row"} under "${headings[index]}", where an earlier step showed "${before}". The earlier value is kept.`,
          path,
        ),
      );
    });
    return rowKey;
  });
  acc.rowOrder = mergeOrdered(acc.rowOrder, rowKeys);
}

function mergeValues(
  acc: Extract<BlockAcc, { kind: "values" }>,
  section: Extract<ChartSectionDraft, { kind: "values" }>,
  step: Step,
) {
  const rowKeys = section.rows.map((raw) => {
    const row: ValuesRow = {
      label: normalizeLine(raw.label),
      value: normalizeLine(raw.value),
      ...(raw.unit !== undefined && normalizeLine(raw.unit) !== ""
        ? { unit: normalizeLine(raw.unit) }
        : {}),
      ...(raw.flag !== undefined ? { flag: raw.flag } : {}),
    };
    const key = [row.label, row.value, row.unit ?? "", row.flag ?? ""].join("|").toLowerCase();
    if (!acc.rows.has(key)) acc.rows.set(key, { fromStep: step, row });
    return key;
  });
  acc.rowOrder = mergeOrdered(acc.rowOrder, rowKeys);
}

function mergeTab(tab: ChartTabDraft, step: Step, state: MergeState, path: Path): string {
  const time = tab.time === undefined ? undefined : normalizeLine(tab.time) || undefined;
  const key = `${keyOf(tab.title)}|${time === undefined ? "" : keyOf(time)}`;
  const acc: TabAcc = state.tabs.get(key) ?? {
    title: normalizeLine(tab.title),
    time,
    presence: Array.from({ length: CASE_STUDY_STEP_COUNT }, () => "absent" as const),
    blockOrder: [],
    blocks: new Map(),
  };
  state.tabs.set(key, acc);
  if (time !== undefined) {
    state.tabTimes.add(keyOf(time));
    seeTime(state, time, step);
  }
  const blockKeys: string[] = [];
  const counters = { table: 0, values: 0 };
  tab.sections.forEach((section, index) => {
    const sectionPath = [...path, "sections", index];
    if (section.kind === "text") {
      for (const paragraph of normalizeMarkdown(section.text).split(/\n{2,}/)) {
        if (paragraph === "") continue;
        const blockKey = `md:${paragraph}`;
        if (!acc.blocks.has(blockKey)) {
          acc.blocks.set(blockKey, { kind: "markdown", fromStep: step, value: paragraph });
        }
        blockKeys.push(blockKey);
      }
      return;
    }
    const blockKey = `${section.kind}:${counters[section.kind]++}`;
    blockKeys.push(blockKey);
    if (section.kind === "table") {
      section.columns.slice(1).forEach((heading) => seeTime(state, normalizeLine(heading), step));
      const existing = acc.blocks.get(blockKey);
      const table =
        existing?.kind === "table"
          ? existing
          : {
              kind: "table" as const,
              fromStep: step,
              columns: [],
              headings: new Map<string, string>(),
              columnFrom: new Map<string, Step>(),
              rowOrder: [],
              rows: new Map<string, TableRowAcc>(),
            };
      acc.blocks.set(blockKey, table);
      mergeTable(table, section, step, state, sectionPath);
      return;
    }
    const existing = acc.blocks.get(blockKey);
    const values =
      existing?.kind === "values"
        ? existing
        : { kind: "values" as const, rowOrder: [], rows: new Map() };
    acc.blocks.set(blockKey, values);
    mergeValues(values, section, step);
  });
  const hasContent = blockKeys.length > 0;
  const before = acc.presence[step - 1];
  acc.presence[step - 1] = hasContent || before === "open" ? "open" : "locked";
  acc.blockOrder = mergeOrdered(acc.blockOrder, blockKeys);
  return key;
}

/** The labels a step's chart lists as times, in its order: tab times, then table headings. */
function timesOf(chart: ChartDraft): string[] {
  return chart.tabs.flatMap((tab) => [
    ...(tab.time === undefined ? [] : [keyOf(tab.time)]),
    ...tab.sections.flatMap((section) =>
      section.kind === "table" ? section.columns.slice(1).map(keyOf) : [],
    ),
  ]);
}

const fromStepOf = (step: Step) => (step > 1 ? { fromStep: step } : {});

/** Groups rows by the step they arrive at, so each later group is its own block. */
function byStep<T extends { fromStep: Step }>(rows: readonly T[]): Map<Step, T[]> {
  const groups = new Map<Step, T[]>();
  for (const row of rows) groups.set(row.fromStep, [...(groups.get(row.fromStep) ?? []), row]);
  return new Map([...groups.entries()].sort(([a], [b]) => a - b));
}

function blocksOf(acc: BlockAcc): EhrBlock[] {
  if (acc.kind === "markdown")
    return [{ kind: "markdown", value: acc.value, ...fromStepOf(acc.fromStep) }];
  if (acc.kind === "values") {
    const rows = acc.rowOrder.map((key) => acc.rows.get(key)!);
    return [...byStep(rows)].map(([step, group]) => ({
      kind: "vitals" as const,
      rows: group.map(({ row }) => row),
      ...fromStepOf(step),
    }));
  }
  const columns = acc.columns.map((key) => acc.headings.get(key) ?? "");
  const rows = acc.rowOrder.map((key) => acc.rows.get(key)!);
  return [...byStep(rows)].map(([step, group]) => ({
    kind: "table" as const,
    columns,
    rows: group.map((row) => acc.columns.map((key) => row.cells.get(key) ?? "")),
    ...fromStepOf(step),
  }));
}

/** Labels that are times: tab times, and the headings of a table that grew a column. */
function timeLabels(state: MergeState): Set<string> {
  const labels = new Set(state.tabTimes);
  for (const tab of state.tabs.values()) {
    for (const block of tab.blocks.values()) {
      if (block.kind !== "table") continue;
      const grew = [...block.columnFrom.values()].some((step) => step > block.fromStep);
      if (!grew) continue;
      block.columns.slice(1).forEach((key) => {
        if (key !== "") labels.add(key.replace(/#\d+$/, ""));
      });
    }
  }
  return labels;
}

/**
 * A tab's access by step, only when the source needs one: a step that shows its name and nothing
 * else (`locked`), or a step without it after one with it (`hidden`). A tab that simply arrives
 * later needs none; its blocks' `fromStep` already keeps it out until then.
 */
function stepAccessOf(presence: TabAcc["presence"]): TabAccess[] | undefined {
  const first = presence.findIndex((state) => state !== "absent");
  const needed =
    presence.includes("locked") || presence.slice(first).some((state) => state === "absent");
  if (!needed) return undefined;
  return presence.map((state) =>
    state === "absent" ? "hidden" : state === "locked" ? "locked" : "open",
  );
}

const TAB_KINDS: [RegExp, EhrTab["kind"]][] = [
  [/history|physical|h\s*&\s*p/i, "history_physical"],
  [/nurs|progress note/i, "nurses_notes"],
  [/vital/i, "vital_signs"],
  [/\blab/i, "lab_results"],
  [/medication administration|\bmar\b/i, "mar"],
  [/order/i, "orders"],
  [/diagnos|imaging|radiolog|\becg\b|\bekg\b/i, "diagnostics"],
];

/** A tab's kind from its title; a title it does not recognize is `custom`. */
export const tabKindOf = (title: string): EhrTab["kind"] =>
  TAB_KINDS.find(([pattern]) => pattern.test(title))?.[1] ?? "custom";

/** The label of the time point a record falls back on when its source names no time at step 1. */
export const DEFAULT_TIME_LABEL = "Admission";

export interface ChartMerge {
  timePoints: EhrRecord["timePoints"];
  tabs: EhrRecord["tabs"];
  reasons: DraftReason[];
}

/**
 * One record from the chart of each step, step 1 first. A part first seen at step N carries
 * `fromStep: N`; repeated notes, rows, columns and results are kept once. A step with no chart
 * reads as the step before. Nothing is reworded, and nothing the charts show is dropped without
 * a `needs_fix` reason.
 */
export function recordFromCharts(charts: readonly ChartDraft[]): ChartMerge {
  const state: MergeState = {
    tabOrder: [],
    tabs: new Map(),
    timeOrder: [],
    timeFirstSeen: new Map(),
    tabTimes: new Set(),
    reasons: [],
  };
  const lastChart = Math.min(charts.length, CASE_STUDY_STEP_COUNT) - 1;
  for (let index = 0; index <= lastChart; index++) {
    const chart = charts[index];
    const step = (index + 1) as Step;
    const keys = chart.tabs.map((tab, tabIndex) =>
      mergeTab(tab, step, state, ["charts", index, "tabs", tabIndex]),
    );
    state.tabOrder = mergeOrdered(state.tabOrder, keys);
    state.timeOrder = mergeOrdered(state.timeOrder, timesOf(chart));
  }
  // A step with no chart of its own shows what the last chart did.
  for (const tab of state.tabs.values()) {
    tab.presence.fill(tab.presence[Math.max(lastChart, 0)], lastChart + 1);
  }

  const labels = timeLabels(state);
  const named = state.timeOrder.filter((key) => labels.has(key) && key !== "");
  const times = named.map((key) => ({
    label: displayLabel(state, key),
    step: state.timeFirstSeen.get(key) ?? 1,
  }));
  // The time selector opens on a time point, so step 1 needs one even when the source names none.
  const opening = times.some((time) => time.step === 1)
    ? []
    : [{ label: DEFAULT_TIME_LABEL, step: 1 as Step }];
  const timePoints = [...opening, ...times].map((time, index) => ({
    id: `tp_${index + 1}`,
    label: time.label,
    ...fromStepOf(time.step),
  }));
  const timeIds = new Map(timePoints.map((point) => [keyOf(point.label), point.id]));

  const tabs: EhrTab[] = [];
  for (const key of state.tabOrder) {
    const acc = state.tabs.get(key)!;
    const blocks = acc.blockOrder.flatMap((blockKey) => blocksOf(acc.blocks.get(blockKey)!));
    if (blocks.length === 0) {
      state.reasons.push(
        needsFix(`The tab "${acc.title}" never shows anything, so it was left out.`, ["charts"]),
      );
      continue;
    }
    const timePointId = acc.time === undefined ? undefined : timeIds.get(keyOf(acc.time));
    const stepAccess = stepAccessOf(acc.presence);
    tabs.push({
      id: `tab_${tabs.length + 1}`,
      kind: tabKindOf(acc.title),
      title: acc.title,
      blocks,
      ...(timePointId === undefined ? {} : { timePointId }),
      ...(stepAccess === undefined ? {} : { stepAccess }),
    });
  }
  return { timePoints, tabs, reasons: state.reasons };
}

/** A time's label as the source first wrote it. */
function displayLabel(state: MergeState, key: string): string {
  for (const tab of state.tabs.values()) {
    if (tab.time !== undefined && keyOf(tab.time) === key) return tab.time;
    for (const block of tab.blocks.values()) {
      if (block.kind === "table" && block.headings.has(key)) return block.headings.get(key)!;
    }
  }
  return key;
}
