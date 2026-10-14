/**
 * A case study's chart as a student may read it at one step (#334).
 *
 * An author can hold parts of the record back: a time point or a block appears `fromStep`, and a
 * tab's `stepAccess` says, step by step, whether it is hidden, locked or open. `recordAtStep` is
 * the one place that reads those fields, and what it returns carries neither of them, so a view
 * says nothing about what arrives later or when.
 *
 * Pure TypeScript: no React, Next or Supabase (ADR 0001).
 */
import {
  CASE_STUDY_STEP_COUNT,
  FIRST_STEP,
  type EhrBlock,
  type EhrRecord,
  type EhrTab,
  type Labeled,
  type TabAccess,
} from "./schemas";
import type { CjmmStep } from "./types";

/** `Omit` over a union collapses it; distributing first keeps the three block kinds apart. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A block as a student sees it: the block, without the step it arrived at. */
export type EhrBlockView = DistributiveOmit<EhrBlock, "fromStep">;

/** What every tab in a view says about itself, readable or not. */
interface EhrTabIdentity {
  id: string;
  kind: EhrTab["kind"];
  title: string;
  /** Kept on a locked tab too, so it is listed at the time it was charted and at no other. */
  timePointId?: string;
}

/** A tab the student can read. Assignable to `EhrTab`, so existing renderers take it as it is. */
export interface OpenEhrTabView extends EhrTabIdentity {
  blocks: EhrBlockView[];
  locked?: undefined;
}

/**
 * A tab the student can see the name of and cannot open. It has no `blocks` at all, rather than
 * an empty list: the text is not in the view, so nothing downstream can render or ship it.
 */
export interface LockedEhrTabView extends EhrTabIdentity {
  locked: true;
}

export type EhrTabView = OpenEhrTabView | LockedEhrTabView;

/** The student's view of a record at one step: `recordAtStep`'s result. */
export interface EhrRecordView {
  patientHeader: EhrRecord["patientHeader"];
  timePoints: Labeled[];
  tabs: EhrTabView[];
}

type TableBlock = Extract<EhrBlock, { kind: "table" }>;
type TableView = Extract<EhrBlockView, { kind: "table" }>;
type VitalsRow = Extract<EhrBlock, { kind: "vitals" }>["rows"][number];

const isStep = (step: number): step is CjmmStep =>
  Number.isInteger(step) && step >= FIRST_STEP && step <= CASE_STUDY_STEP_COUNT;

function assertStep(step: number): asserts step is CjmmStep {
  if (!isStep(step)) {
    throw new RangeError(`a case study step is a whole number from 1 to ${CASE_STUDY_STEP_COUNT}`);
  }
}

const revealedBy = (fromStep: number | undefined, step: CjmmStep): boolean =>
  (fromStep ?? FIRST_STEP) <= step;

/**
 * A tab's access at a step: open when the tab says nothing. A list that stops short of the step
 * can only come from a record that was never parsed, and is read as hidden rather than open.
 */
export function tabAccessAt(tab: Pick<EhrTab, "stepAccess">, step: CjmmStep): TabAccess {
  if (tab.stepAccess === undefined) return "open";
  return tab.stepAccess[step - FIRST_STEP] ?? "hidden";
}

/**
 * How a table heading is matched to a time point's label: trimmed and without regard to case, so
 * "0130 " still hides with "0130". Looser matching only ever hides more.
 */
const labelKey = (label: string): string => label.trim().toLowerCase();

/**
 * A table without the columns headed by a hidden time point's label, which is how a vitals flow
 * sheet is written: one column per time, headed by the time's own label. Null when no column is
 * left to show. The heading is the only link a column has to a time, so a column headed anything
 * else ("0130 after the bolus") is not recognized and needs `fromStep` on its block instead.
 */
function tableAtStep(table: TableBlock, hiddenLabels: ReadonlySet<string>): TableView | null {
  const kept = table.columns.map((column) => !hiddenLabels.has(labelKey(column)));
  if (!kept.some(Boolean)) return null;
  return {
    kind: table.kind,
    columns: table.columns.filter((_, index) => kept[index]),
    // A cell past the last column has no heading to be hidden with, so it stays.
    rows: table.rows.map((row) => row.filter((_, index) => kept[index] ?? true)),
  };
}

/** One vitals row, field by field, so nothing the schema does not name comes along. */
const vitalsRowView = (row: VitalsRow): VitalsRow => ({
  label: row.label,
  value: row.value,
  ...(row.unit === undefined ? {} : { unit: row.unit }),
  ...(row.flag === undefined ? {} : { flag: row.flag }),
});

/**
 * A block as the view holds it, or null when the step has not reached it. Built field by field
 * rather than copied, so the view shares nothing with the author's record and carries nothing but
 * what is named here: not `fromStep`, and not a key an unparsed record happened to have.
 */
function blockAtStep(
  block: EhrBlock,
  step: CjmmStep,
  hiddenLabels: ReadonlySet<string>,
): EhrBlockView | null {
  if (!revealedBy(block.fromStep, step)) return null;
  if (block.kind === "table") return tableAtStep(block, hiddenLabels);
  if (block.kind === "vitals") return { kind: block.kind, rows: block.rows.map(vitalsRowView) };
  return { kind: block.kind, value: block.value };
}

const identityOf = (tab: EhrTab): EhrTabIdentity => ({
  id: tab.id,
  kind: tab.kind,
  title: tab.title,
  ...(tab.timePointId === undefined ? {} : { timePointId: tab.timePointId }),
});

function tabAtStep(
  tab: EhrTab,
  step: CjmmStep,
  hiddenTimeIds: ReadonlySet<string>,
  hiddenLabels: ReadonlySet<string>,
): EhrTabView | null {
  if (tab.timePointId !== undefined && hiddenTimeIds.has(tab.timePointId)) return null;
  const access = tabAccessAt(tab, step);
  if (access === "hidden") return null;
  if (access === "locked") return { ...identityOf(tab), locked: true };
  const blocks = tab.blocks
    .map((block) => blockAtStep(block, step, hiddenLabels))
    .filter((block): block is EhrBlockView => block !== null);
  return blocks.length === 0 ? null : { ...identityOf(tab), blocks };
}

/**
 * The student's view of a case study's record at `step` (1 to 6):
 *
 * - a time point or block whose `fromStep` is later is not there, and neither is a tab charted at
 *   a time point that is not there;
 * - a table loses the columns headed by a hidden time point's label. Where a hidden and a visible
 *   time point share a label, the column is hidden: which of the two it belongs to cannot be
 *   told, and showing too little is the safe mistake;
 * - a tab that is `hidden` at the step, or open with no blocks left, is not there;
 * - a tab that is `locked` is its id, kind, title and time, marked `locked: true`. Its blocks are
 *   not in the result.
 *
 * A record with neither field comes back equal to itself at every step. The view is a copy, so
 * nothing done to it reaches the record. A step outside 1 to 6 throws, because guessing either
 * way shows the wrong chart.
 */
export function recordAtStep(record: EhrRecord, step: CjmmStep): EhrRecordView {
  assertStep(step);
  const shownTimes = record.timePoints.filter((point) => revealedBy(point.fromStep, step));
  const hiddenTimes = record.timePoints.filter((point) => !revealedBy(point.fromStep, step));
  const hiddenTimeIds = new Set(hiddenTimes.map((point) => point.id));
  const hiddenLabels = new Set(hiddenTimes.map((point) => labelKey(point.label)));

  return {
    patientHeader: { ...record.patientHeader },
    timePoints: shownTimes.map(({ id, label }) => ({ id, label })),
    tabs: record.tabs
      .map((tab) => tabAtStep(tab, step, hiddenTimeIds, hiddenLabels))
      .filter((tab): tab is EhrTabView => tab !== null),
  };
}

/**
 * The step a live room's chart is at, from the room's one-based position (#335). A room that has
 * not started, or has no position, is at step 1: the chart a class opens with. A position past the
 * sixth step reads as the sixth, which only a set longer than a case study could produce.
 */
export function stepAtPosition(position: number | null): CjmmStep {
  if (position === null || !Number.isFinite(position) || position < FIRST_STEP) return FIRST_STEP;
  return Math.min(Math.floor(position), CASE_STUDY_STEP_COUNT) as CjmmStep;
}

/**
 * The furthest step a student working at their own pace has reached (#335): the step after the
 * last of an unbroken run of answered steps from step 1, and never past the last step. `answered`
 * is one flag per step, step 1 first. An answer to a later step with a gap before it reaches
 * nothing, so a step's chart is only ever opened by answering every step before it.
 */
export function reachedStep(answered: readonly boolean[]): CjmmStep {
  const run = answered.findIndex((done) => !done);
  const leading = run === -1 ? answered.length : run;
  return Math.min(leading + FIRST_STEP, CASE_STUDY_STEP_COUNT) as CjmmStep;
}

/**
 * The record's view at each step from step 1 to `reached`, step 1 first (#335): every chart a
 * student who has reached that step may go back to, and none they have not reached. Each is
 * `recordAtStep`'s own, so nothing here decides what a view holds.
 */
export function recordsThrough(record: EhrRecord, reached: CjmmStep): EhrRecordView[] {
  assertStep(reached);
  return Array.from({ length: reached }, (_, index) =>
    recordAtStep(record, (index + FIRST_STEP) as CjmmStep),
  );
}

/** Whether any part of a record arrives later or is ever locked or hidden: what an author's marker says. */
export function isStagedRecord(record: EhrRecord): boolean {
  return (
    record.timePoints.some((point) => point.fromStep !== undefined) ||
    record.tabs.some(
      (tab) =>
        tab.stepAccess !== undefined || tab.blocks.some((block) => block.fromStep !== undefined),
    )
  );
}
