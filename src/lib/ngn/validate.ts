import { itemQualityWarnings } from "./quality";
import { caseStudySchema, itemSchema, type CaseStudy, type Item } from "./schemas";

export type ValidationResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const formatIssue = (issue: { path: PropertyKey[]; message: string }): string =>
  issue.path.length ? `${issue.path.map(String).join(".")}: ${issue.message}` : issue.message;

/** Warning-level authoring rules (spec §6), as plain messages. Errors live in the schemas. */
export function itemWarnings(item: Item): string[] {
  return itemQualityWarnings(item).map((warning) => warning.message);
}

export function validateItem(input: unknown): ValidationResult<Item> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(formatIssue) };
  }
  return { ok: true, value: parsed.data, warnings: itemWarnings(parsed.data) };
}

export function validateCaseStudy(input: unknown): ValidationResult<CaseStudy> {
  const parsed = caseStudySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(formatIssue) };
  }
  const warnings = parsed.data.items.flatMap((item, index) =>
    itemWarnings(item).map((w) => `items.${index}: ${w}`),
  );
  return { ok: true, value: parsed.data, warnings };
}
