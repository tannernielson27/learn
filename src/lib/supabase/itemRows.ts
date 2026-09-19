import type { CaseStudy, Item } from "@/lib/ngn/schemas";
import { normalizeTags } from "@/lib/ngn/tags";
import { validateItem, type ValidationResult } from "@/lib/ngn/validate";
import type { Json } from "./database.types";

/** The columns of `public.items` that hold the item itself. */
export interface ItemRow {
  type: string;
  cjmm_step: number | null;
  tags: string[];
  version: number;
  /** The item without answerKey, rationale, scoring and the fields stored as columns. */
  content: Json;
  answer_key: Json;
  rationale: Json;
  scoring: Json;
}

export interface CaseStudyRow {
  title: string;
  tags: string[];
  ehr: Json;
  /** The six items in CJMM step order. */
  items: ItemRow[];
}

/**
 * Splits a validated item into row columns. The key and rationale get their own columns so a
 * keyless read selects `content` and never has to strip JSON (ADR 0003). Values are deep-copied.
 */
export function toItemRow(item: Item): ItemRow {
  const { type, cjmmStep, tags, version, answerKey, rationale, scoring, ...content } = item;
  return {
    type,
    cjmm_step: cjmmStep ?? null,
    // A draft reaches here unparsed, so tags are normalized here too (docs/transfer-format.md).
    tags: normalizeTags(tags),
    version,
    content: toJson(content),
    answer_key: toJson(answerKey),
    rationale: toJson(rationale),
    scoring: toJson(scoring),
  };
}

/** Reassembles a row and validates it again: stored JSON is external input like any other. */
export function fromItemRow(row: ItemRow): ValidationResult<Item> {
  return validateItem({
    ...(isRecord(row.content) ? row.content : {}),
    type: row.type,
    cjmmStep: row.cjmm_step ?? undefined,
    tags: row.tags,
    version: row.version,
    answerKey: row.answer_key,
    rationale: row.rationale,
    scoring: row.scoring,
  });
}

export function toCaseStudyRow(caseStudy: CaseStudy): CaseStudyRow {
  return {
    title: caseStudy.title,
    tags: [...caseStudy.tags],
    ehr: toJson(caseStudy.ehr),
    items: caseStudy.items.map(toItemRow),
  };
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
