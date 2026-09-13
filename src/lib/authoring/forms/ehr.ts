import {
  ehrBlockSchema,
  ehrRecordSchema,
  ehrTabSchema,
  type EhrBlock,
  type EhrRecord,
  type EhrTab,
} from "@/lib/ngn/schemas";
import { isRecord, storedString, storedStrings } from "./storedValues";

/** Enough for any teaching record; the draft schema refuses more. */
export const EHR_LIMITS = {
  timePoints: 12,
  tabs: 40,
  blocks: 12,
  tableColumns: 12,
  tableRows: 60,
  vitalsRows: 60,
} as const;

export type EhrTabKind = EhrTab["kind"];

/** What each kind of section is called in the record, and its title when first added. */
export const EHR_TAB_KIND_LABELS: Record<EhrTabKind, string> = {
  history_physical: "History & Physical",
  nurses_notes: "Nurses' Notes",
  vital_signs: "Vital Signs",
  lab_results: "Lab Results",
  orders: "Orders",
  mar: "MAR",
  diagnostics: "Diagnostics",
  custom: "Custom",
};
export const EHR_TAB_KINDS = Object.keys(EHR_TAB_KIND_LABELS) as EhrTabKind[];

export type EhrSex = "" | "female" | "male" | "other";
export type EhrFlag = "" | "H" | "L";

export interface EhrPatientForm {
  name: string;
  /** Typed text, so a half-typed or cleared age is never stored as a number it is not. */
  age: string;
  sex: EhrSex;
  setting: string;
  admissionDate: string;
}

export interface EhrVitalsRowForm {
  label: string;
  value: string;
  unit: string;
  flag: EhrFlag;
}

export type EhrTableBlockForm = { kind: "table"; columns: string[]; rows: string[][] };
export type EhrVitalsBlockForm = { kind: "vitals"; rows: EhrVitalsRowForm[] };
export type EhrBlockForm =
  { kind: "markdown"; value: string } | EhrTableBlockForm | EhrVitalsBlockForm;
export type EhrBlockKind = EhrBlockForm["kind"];

export interface EhrTimePointForm {
  id: string;
  label: string;
}

export interface EhrTabForm {
  id: string;
  kind: EhrTabKind;
  title: string;
  /** "" when the section is charted at every time. */
  timePointId: string;
  blocks: EhrBlockForm[];
}

export interface EhrFormValues {
  patient: EhrPatientForm;
  timePoints: EhrTimePointForm[];
  tabs: EhrTabForm[];
}

const SEXES: readonly EhrSex[] = ["female", "male", "other"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WHOLE_YEARS = /^\d{1,3}$/;

function unusedId(prefix: string, taken: readonly string[]): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

// ---------------------------------------------------------------------------
// Record <-> form
// ---------------------------------------------------------------------------

function blockToForm(block: EhrBlock): EhrBlockForm {
  switch (block.kind) {
    case "markdown":
      return { kind: "markdown", value: block.value };
    case "table":
      return {
        kind: "table",
        columns: [...block.columns],
        rows: block.rows.map((row) => [...row]),
      };
    case "vitals":
      return {
        kind: "vitals",
        rows: block.rows.map((row) => ({
          label: row.label,
          value: row.value,
          unit: row.unit ?? "",
          flag: row.flag ?? "",
        })),
      };
  }
}

export function toEhrForm(record: EhrRecord): EhrFormValues {
  const header = record.patientHeader;
  return {
    patient: {
      name: header.name ?? "",
      age: String(header.age),
      sex: header.sex,
      setting: header.setting,
      admissionDate: header.admissionDate ?? "",
    },
    timePoints: record.timePoints.map(({ id, label }) => ({ id, label })),
    tabs: record.tabs.map((tab) => ({
      id: tab.id,
      kind: tab.kind,
      title: tab.title,
      timePointId: tab.timePointId ?? "",
      blocks: tab.blocks.map(blockToForm),
    })),
  };
}

function blockFromForm(block: EhrBlockForm): unknown {
  if (block.kind !== "vitals") return block;
  return {
    kind: "vitals",
    rows: block.rows.map((row) => ({
      label: row.label,
      value: row.value,
      ...(row.unit ? { unit: row.unit } : {}),
      ...(row.flag ? { flag: row.flag } : {}),
    })),
  };
}

function tabFromForm(tab: EhrTabForm, blocks: unknown[]) {
  return {
    id: tab.id,
    kind: tab.kind,
    title: tab.title,
    blocks,
    ...(tab.timePointId ? { timePointId: tab.timePointId } : {}),
  };
}

/**
 * The record input the form describes, checked by `ehrRecordSchema` rather than here. Blank
 * optional fields are left out, and an age or sex not yet given is missing, not guessed.
 */
export function fromEhrForm(values: EhrFormValues): unknown {
  const { patient } = values;
  const age = patient.age.trim();
  return {
    patientHeader: {
      ...(patient.name.trim() ? { name: patient.name } : {}),
      // Missing unless a whole number the record can hold, so a draft never stores age 999.
      ...(WHOLE_YEARS.test(age) && Number(age) <= 120 ? { age: Number(age) } : {}),
      ...(patient.sex ? { sex: patient.sex } : {}),
      setting: patient.setting,
      ...(patient.admissionDate.trim() ? { admissionDate: patient.admissionDate } : {}),
    },
    timePoints: values.timePoints.map(({ id, label }) => ({ id, label })),
    tabs: values.tabs.map((tab) => tabFromForm(tab, tab.blocks.map(blockFromForm))),
  };
}

export function emptyEhrForm(): EhrFormValues {
  return {
    patient: { name: "", age: "", sex: "", setting: "", admissionDate: "" },
    timePoints: [{ id: "t1", label: "Admission" }],
    tabs: [],
  };
}

// ---------------------------------------------------------------------------
// Time points and sections
// ---------------------------------------------------------------------------

export function addTimePoint(values: EhrFormValues): EhrFormValues {
  if (values.timePoints.length >= EHR_LIMITS.timePoints) return values;
  const id = unusedId(
    "t",
    values.timePoints.map((point) => point.id),
  );
  return { ...values, timePoints: [...values.timePoints, { id, label: "" }] };
}

/** Removes a time point and clears it from every section charted then, so none points nowhere. */
export function removeTimePoint(values: EhrFormValues, timePointId: string): EhrFormValues {
  if (values.timePoints.length <= 1) return values;
  return {
    ...values,
    timePoints: values.timePoints.filter((point) => point.id !== timePointId),
    tabs: values.tabs.map((tab) =>
      tab.timePointId === timePointId ? { ...tab, timePointId: "" } : tab,
    ),
  };
}

export function newBlock(kind: EhrBlockKind): EhrBlockForm {
  switch (kind) {
    case "markdown":
      return { kind, value: "" };
    case "table":
      return { kind, columns: ["", ""], rows: [["", ""]] };
    case "vitals":
      return { kind, rows: [{ label: "", value: "", unit: "", flag: "" }] };
  }
}

export function addTab(values: EhrFormValues, kind: EhrTabKind): EhrFormValues {
  if (values.tabs.length >= EHR_LIMITS.tabs) return values;
  const tab: EhrTabForm = {
    id: unusedId(
      "tab_",
      values.tabs.map((existing) => existing.id),
    ),
    kind,
    title: kind === "custom" ? "" : EHR_TAB_KIND_LABELS[kind],
    timePointId: "",
    blocks: [newBlock(kind === "vital_signs" || kind === "lab_results" ? "vitals" : "markdown")],
  };
  return { ...values, tabs: [...values.tabs, tab] };
}

function mapTab(
  values: EhrFormValues,
  index: number,
  change: (tab: EhrTabForm) => EhrTabForm,
): EhrFormValues {
  return { ...values, tabs: values.tabs.map((tab, at) => (at === index ? change(tab) : tab)) };
}

export function updateTab(
  values: EhrFormValues,
  index: number,
  patch: Partial<Pick<EhrTabForm, "kind" | "title" | "timePointId">>,
): EhrFormValues {
  return mapTab(values, index, (tab) => ({ ...tab, ...patch }));
}

export function removeTab(values: EhrFormValues, index: number): EhrFormValues {
  return { ...values, tabs: values.tabs.filter((_, at) => at !== index) };
}

/** Moves a section one place up (-1) or down (1); at either end nothing changes. */
export function moveTab(values: EhrFormValues, index: number, delta: -1 | 1): EhrFormValues {
  const target = index + delta;
  if (target < 0 || target >= values.tabs.length) return values;
  const tabs = [...values.tabs];
  [tabs[index], tabs[target]] = [tabs[target]!, tabs[index]!];
  return { ...values, tabs };
}

export function addBlock(values: EhrFormValues, tabIndex: number, kind: EhrBlockKind) {
  return mapTab(values, tabIndex, (tab) =>
    tab.blocks.length >= EHR_LIMITS.blocks
      ? tab
      : { ...tab, blocks: [...tab.blocks, newBlock(kind)] },
  );
}

/** Removes a block; a section's only block stays, since a section needs one. */
export function removeBlock(values: EhrFormValues, tabIndex: number, blockIndex: number) {
  if ((values.tabs[tabIndex]?.blocks.length ?? 0) <= 1) return values;
  return mapTab(values, tabIndex, (tab) => ({
    ...tab,
    blocks: tab.blocks.filter((_, at) => at !== blockIndex),
  }));
}

export function updateBlock(
  values: EhrFormValues,
  tabIndex: number,
  blockIndex: number,
  block: EhrBlockForm,
): EhrFormValues {
  return mapTab(values, tabIndex, (tab) => ({
    ...tab,
    blocks: tab.blocks.map((existing, at) => (at === blockIndex ? block : existing)),
  }));
}

// ---------------------------------------------------------------------------
// Table and vitals grids (every row stays as wide as the headings)
// ---------------------------------------------------------------------------

export function addTableRow(block: EhrTableBlockForm): EhrTableBlockForm {
  if (block.rows.length >= EHR_LIMITS.tableRows) return block;
  return { ...block, rows: [...block.rows, block.columns.map(() => "")] };
}

export function removeTableRow(block: EhrTableBlockForm, rowIndex: number): EhrTableBlockForm {
  if (block.rows.length <= 1) return block;
  return { ...block, rows: block.rows.filter((_, at) => at !== rowIndex) };
}

export function addTableColumn(block: EhrTableBlockForm): EhrTableBlockForm {
  if (block.columns.length >= EHR_LIMITS.tableColumns) return block;
  return {
    ...block,
    columns: [...block.columns, ""],
    rows: block.rows.map((row) => [...row, ""]),
  };
}

export function removeTableColumn(block: EhrTableBlockForm, column: number): EhrTableBlockForm {
  if (block.columns.length <= 1) return block;
  return {
    ...block,
    columns: block.columns.filter((_, at) => at !== column),
    rows: block.rows.map((row) => row.filter((_, at) => at !== column)),
  };
}

export function setTableHeading(
  block: EhrTableBlockForm,
  column: number,
  text: string,
): EhrTableBlockForm {
  return {
    ...block,
    columns: block.columns.map((heading, at) => (at === column ? text : heading)),
  };
}

export function setTableCell(
  block: EhrTableBlockForm,
  row: number,
  column: number,
  text: string,
): EhrTableBlockForm {
  return {
    ...block,
    rows: block.rows.map((cells, at) =>
      at === row ? cells.map((cell, index) => (index === column ? text : cell)) : cells,
    ),
  };
}

export function addVitalsRow(block: EhrVitalsBlockForm): EhrVitalsBlockForm {
  if (block.rows.length >= EHR_LIMITS.vitalsRows) return block;
  return { ...block, rows: [...block.rows, { label: "", value: "", unit: "", flag: "" }] };
}

export function removeVitalsRow(block: EhrVitalsBlockForm, rowIndex: number): EhrVitalsBlockForm {
  if (block.rows.length <= 1) return block;
  return { ...block, rows: block.rows.filter((_, at) => at !== rowIndex) };
}

export function updateVitalsRow(
  block: EhrVitalsBlockForm,
  rowIndex: number,
  patch: Partial<EhrVitalsRowForm>,
): EhrVitalsBlockForm {
  return {
    ...block,
    rows: block.rows.map((row, at) => (at === rowIndex ? { ...row, ...patch } : row)),
  };
}

// ---------------------------------------------------------------------------
// Reopening stored JSON, which is external input
// ---------------------------------------------------------------------------

function blockFromStored(value: unknown): EhrBlockForm | null {
  if (!isRecord(value)) return null;
  if (value.kind === "markdown" && typeof value.value === "string") {
    return { kind: "markdown", value: value.value };
  }
  if (value.kind === "table" && Array.isArray(value.rows)) {
    const columns = storedStrings(value.columns).slice(0, EHR_LIMITS.tableColumns);
    const rows = value.rows
      .filter(Array.isArray)
      .slice(0, EHR_LIMITS.tableRows)
      .map((row) => {
        const cells = storedStrings(row);
        return columns.map((_, at) => cells[at] ?? "");
      });
    return columns.length > 0 && rows.length > 0 ? { kind: "table", columns, rows } : null;
  }
  if (value.kind === "vitals" && Array.isArray(value.rows)) {
    const rows = value.rows
      .filter(isRecord)
      .slice(0, EHR_LIMITS.vitalsRows)
      .map((row) => ({
        label: storedString(row.label),
        value: storedString(row.value),
        unit: storedString(row.unit),
        flag: row.flag === "H" || row.flag === "L" ? row.flag : ("" as EhrFlag),
      }));
    return rows.length > 0 ? { kind: "vitals", rows } : null;
  }
  return null;
}

/** Ids that are valid and not already used, with a fresh one for anything else. */
function claimIds(stored: unknown[], prefix: string): string[] {
  const taken: string[] = [];
  for (const entry of stored) {
    const id = isRecord(entry) ? entry.id : undefined;
    taken.push(
      typeof id === "string" && ID.test(id) && !taken.includes(id) ? id : unusedId(prefix, taken),
    );
  }
  return taken;
}

/** Reopens a stored record, which may be an unfinished draft, keeping whatever is well formed. */
export function ehrFormFromStored(stored: unknown): EhrFormValues {
  const empty = emptyEhrForm();
  if (!isRecord(stored)) return empty;

  const header = isRecord(stored.patientHeader) ? stored.patientHeader : {};
  const age = header.age;
  const patient: EhrPatientForm = {
    name: storedString(header.name),
    age:
      typeof age === "number" && Number.isInteger(age) && age >= 0 && age <= 120 ? String(age) : "",
    sex: SEXES.find((sex) => sex === header.sex) ?? "",
    setting: storedString(header.setting),
    admissionDate: storedString(header.admissionDate),
  };

  const storedPoints = Array.isArray(stored.timePoints)
    ? stored.timePoints
        .filter((point) => isRecord(point) && typeof point.id === "string")
        .slice(0, EHR_LIMITS.timePoints)
    : [];
  const pointIds = claimIds(storedPoints, "t");
  const timePoints =
    storedPoints.length > 0
      ? storedPoints.map((point, at) => ({
          id: pointIds[at]!,
          label: storedString((point as Record<string, unknown>).label),
        }))
      : empty.timePoints;
  const times = new Set(timePoints.map((point) => point.id));

  const storedTabs = Array.isArray(stored.tabs)
    ? stored.tabs.filter(isRecord).slice(0, EHR_LIMITS.tabs)
    : [];
  const tabIds = claimIds(storedTabs, "tab_");
  const tabs = storedTabs.map((tab, at) => {
    const timePointId = storedString(tab.timePointId);
    return {
      id: tabIds[at]!,
      kind: EHR_TAB_KINDS.find((kind) => kind === tab.kind) ?? "custom",
      title: storedString(tab.title),
      timePointId: times.has(timePointId) ? timePointId : "",
      blocks: (Array.isArray(tab.blocks) ? tab.blocks : [])
        .map(blockFromStored)
        .filter((block): block is EhrBlockForm => block !== null)
        .slice(0, EHR_LIMITS.blocks),
    };
  });

  return { patient, timePoints, tabs };
}

// ---------------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------------

/**
 * A record the panel can show while the author is still writing: the finished sections of an
 * unfinished record, with unlabelled times named by their place. Null until the patient header is
 * complete and at least one section is finished, since the panel always opens a section.
 */
export function previewRecord(values: EhrFormValues): EhrRecord | null {
  const input = fromEhrForm(values) as { patientHeader: unknown };
  const whole = ehrRecordSchema.safeParse(input);
  if (whole.success) return whole.data;

  const header = ehrRecordSchema.shape.patientHeader.safeParse(input.patientHeader);
  if (!header.success) return null;

  const timePoints = values.timePoints.map((point, at) => ({
    id: point.id,
    label: point.label.trim() ? point.label : `Time ${at + 1}`,
  }));
  const times = new Set(timePoints.map((point) => point.id));
  const tabs = values.tabs.flatMap((tab) => {
    if (tab.timePointId && !times.has(tab.timePointId)) return [];
    const blocks = tab.blocks
      .map(blockFromForm)
      .filter((block) => ehrBlockSchema.safeParse(block).success);
    const parsed = ehrTabSchema.safeParse(tabFromForm(tab, blocks));
    return parsed.success ? [parsed.data] : [];
  });
  if (tabs.length === 0) return null;

  const record = ehrRecordSchema.safeParse({ patientHeader: header.data, timePoints, tabs });
  return record.success ? record.data : null;
}
