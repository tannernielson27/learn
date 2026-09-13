import { caseStudySchema, itemSchema, type CaseStudy, type Item } from "@/lib/ngn/schemas";
import type { Json } from "@/lib/supabase/database.types";
import { toCaseStudyRow, toItemRow, type ItemRow } from "@/lib/supabase/itemRows";
import { withinItemSizeLimit } from "./payloadSize";

/**
 * The learn.v1 exchange format (docs/transfer-format.md): an envelope holding either items or one
 * case study, in the same validated shape the ngn schemas describe. Pure, so it runs anywhere.
 */
export const LEARN_FORMAT = "learn.v1";
/** Below the default 1 MB Server Action body limit, with room for the form around it. */
export const IMPORT_MAX_BYTES = 800_000;
export const IMPORT_MAX_ITEMS = 50;

const MAX_ERRORS = 20;
const ISSUES_PER_ENTRY = 3;

export const IMPORT_ERRORS = {
  tooLarge: "This import is too large. Import at most 800 KB at a time.",
  notJson: "This is not valid JSON.",
  notLearn: 'This is not a LeaRN export. It needs "format": "learn.v1".',
  eitherOr: "A LeaRN export holds either items or one case study.",
  itemCount: `Include between 1 and ${IMPORT_MAX_ITEMS} items.`,
} as const;

export interface ItemsEnvelope {
  format: typeof LEARN_FORMAT;
  items: Item[];
}
export interface CaseStudyEnvelope {
  format: typeof LEARN_FORMAT;
  caseStudy: CaseStudy;
}

export function itemsEnvelope(items: readonly Item[]): ItemsEnvelope {
  return { format: LEARN_FORMAT, items: [...items] };
}

export function caseStudyEnvelope(caseStudy: CaseStudy): CaseStudyEnvelope {
  return { format: LEARN_FORMAT, caseStudy };
}

export type ParsedImport =
  | { ok: true; kind: "items"; items: Item[] }
  | { ok: true; kind: "caseStudy"; caseStudy: CaseStudy }
  | { ok: false; errors: string[] };
export type ValidImport = Extract<ParsedImport, { ok: true }>;

const fail = (...errors: string[]): ParsedImport => ({
  ok: false,
  errors: errors.slice(0, MAX_ERRORS),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A schema path as a field name. Only plain key characters are kept, so a message can never carry
 * the file's own text (a hostile key, or markup) back to the page.
 */
function fieldOf(path: readonly PropertyKey[]): string {
  return path
    .map(String)
    .join(".")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 80);
}

/** Up to a few problems for one entry, one per field, naming the entry and field only. */
function describeEntry(
  label: string,
  issues: readonly { path: readonly PropertyKey[] }[],
): string[] {
  const fields = [...new Set(issues.map((issue) => fieldOf(issue.path)))].slice(
    0,
    ISSUES_PER_ENTRY,
  );
  return fields.map((field) =>
    field ? `${label}: "${field}" is not valid.` : `${label} is not valid.`,
  );
}

/**
 * Reads an import: bounded in size before it is parsed, a learn.v1 envelope, and every entry valid
 * against the ngn schemas. Any problem refuses the whole import, with plain reasons per entry.
 */
export function parseImport(text: string): ParsedImport {
  if (text.length > IMPORT_MAX_BYTES || new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) {
    return fail(IMPORT_ERRORS.tooLarge);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(IMPORT_ERRORS.notJson);
  }
  if (!isRecord(data) || data.format !== LEARN_FORMAT) return fail(IMPORT_ERRORS.notLearn);

  const hasItems = "items" in data;
  const hasCaseStudy = "caseStudy" in data;
  if (hasItems === hasCaseStudy) return fail(IMPORT_ERRORS.eitherOr);

  if (hasItems) {
    const entries = data.items;
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > IMPORT_MAX_ITEMS) {
      return fail(IMPORT_ERRORS.itemCount);
    }
    const errors: string[] = [];
    const items: Item[] = [];
    entries.forEach((entry, index) => {
      const label = `Item ${index + 1}`;
      if (!withinItemSizeLimit(entry)) {
        errors.push(`${label} is too large.`);
        return;
      }
      const parsed = itemSchema.safeParse(entry);
      if (parsed.success) items.push(parsed.data);
      else errors.push(...describeEntry(label, parsed.error.issues));
    });
    return errors.length > 0 ? fail(...errors) : { ok: true, kind: "items", items };
  }

  const parsed = caseStudySchema.safeParse(data.caseStudy);
  if (parsed.success) return { ok: true, kind: "caseStudy", caseStudy: parsed.data };

  // Problems inside a step are named by the step's number; the rest belong to the case study.
  const errors: string[] = [];
  const byStep = new Map<number, { path: readonly PropertyKey[] }[]>();
  const general: { path: readonly PropertyKey[] }[] = [];
  for (const issue of parsed.error.issues) {
    const [area, index, ...rest] = issue.path;
    if (area === "items" && typeof index === "number") {
      byStep.set(index, [...(byStep.get(index) ?? []), { path: rest }]);
    } else {
      general.push(issue);
    }
  }
  errors.push(...describeEntry("Case study", general));
  for (const [index, issues] of [...byStep.entries()].sort((a, b) => a[0] - b[0])) {
    errors.push(...describeEntry(`Case study, step ${index + 1}`, issues));
  }
  return fail(...errors);
}

/** What the import function writes: item rows without the file's ids, at version 1. */
export interface ImportRows {
  items: ItemRow[];
  caseStudy: { title: string; tags: string[]; ehr: Json; items: ItemRow[] } | null;
}

function importRow(item: Item, step?: number): ItemRow {
  const row = toItemRow(item);
  // The file's id is never used; the database gives every imported item a new one.
  const content = Object.fromEntries(
    Object.entries(row.content as Record<string, Json>).filter(([key]) => key !== "id"),
  );
  return { ...row, version: 1, content, ...(step === undefined ? {} : { cjmm_step: step }) };
}

export function importRowsFor(parsed: ValidImport): ImportRows {
  if (parsed.kind === "items") {
    return { items: parsed.items.map((item) => importRow(item)), caseStudy: null };
  }
  const row = toCaseStudyRow(parsed.caseStudy);
  return {
    items: [],
    caseStudy: {
      title: row.title,
      tags: row.tags,
      ehr: row.ehr,
      items: parsed.caseStudy.items.map((item, index) => importRow(item, index + 1)),
    },
  };
}

export function importSummary(parsed: ValidImport): string {
  if (parsed.kind === "caseStudy") {
    return `Imported the case study "${parsed.caseStudy.title}" and its six steps as drafts.`;
  }
  return parsed.items.length === 1
    ? "Imported 1 item as a draft."
    : `Imported ${parsed.items.length} items as drafts.`;
}
