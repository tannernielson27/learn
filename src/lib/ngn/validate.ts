import { caseStudySchema, itemSchema, spanIdsOf, type CaseStudy, type Item } from "./schemas";

export type ValidationResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const formatIssue = (issue: { path: PropertyKey[]; message: string }): string =>
  issue.path.length ? `${issue.path.map(String).join(".")}: ${issue.message}` : issue.message;

/** Warning-level authoring rules (spec §6). Errors live in the schemas. */
export function itemWarnings(item: Item): string[] {
  const warnings: string[] = [];
  if (!item.rationale.general) {
    warnings.push("rationale.general is missing; required before publishing");
  }
  if (item.type === "multiple_response" && item.content.variant === "sata") {
    if (item.answerKey.correctOptionIds.length === item.content.options.length) {
      warnings.push("every SATA option is marked correct");
    }
  }
  if (item.type === "highlight_text" || item.type === "highlight_table") {
    const spanCount =
      item.type === "highlight_text"
        ? spanIdsOf(item.content.passage).length
        : item.content.rows.reduce(
            (n, r) => n + r.cells.reduce((m, c) => m + spanIdsOf(c).length, 0),
            0,
          );
    if (item.answerKey.correctSpanIds.length > spanCount * 0.6) {
      warnings.push("more than 60% of highlightable spans are correct");
    }
  }
  return warnings;
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
