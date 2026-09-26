import {
  importRowsFor,
  LEARN_FORMAT,
  parseImport,
  type ImportRows,
} from "@/lib/authoring/transfer";
import { FIXTURES, sampleCaseStudy, sampleTrendItem } from "@/lib/ngn/fixtures";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { publishBlockers } from "@/lib/ngn/quality";
import { validateCaseStudy, validateItem } from "@/lib/ngn/validate";

/**
 * The sample bank an instructor can import from the Get started checklist (#265). It is the same
 * set `src/lib/supabase/seed.ts` writes, and it goes through the same learn.v1 parse and validation
 * as a file an author imports, so the sample can never hold anything an import would refuse.
 */
export const SAMPLE_BANK_NAME = "Sample bank";

/** Every canonical item, the Trend item and the sample case study, as fixture inputs. */
export function sampleSet(): { items: unknown[]; caseStudy: unknown } {
  return {
    items: [...ITEM_TYPES.map((type) => FIXTURES[type].canonical), sampleTrendItem],
    caseStudy: sampleCaseStudy,
  };
}

/**
 * What would stop the editor publishing each part of a sample set (#283): an item or step that does
 * not validate, or has no general rationale (`checkPublishable`'s rule), or a case study that does
 * not validate. The sample arrives published, so it must hold nothing the editor would refuse.
 */
export function samplePublishProblems(set: { items: unknown[]; caseStudy: unknown }): string[] {
  const unpublishable = (input: unknown) => {
    const result = validateItem(input);
    return !result.ok || publishBlockers(result.value).length > 0;
  };
  const problems = set.items.flatMap((item, index) =>
    unpublishable(item) ? [`items.${index} cannot be published`] : [],
  );
  const study = validateCaseStudy(set.caseStudy);
  if (!study.ok) return [...problems, "the case study cannot be published"];
  return [
    ...problems,
    ...study.value.items.flatMap((step, index) =>
      unpublishable(step) ? [`caseStudy.items.${index} cannot be published`] : [],
    ),
  ];
}

/**
 * The rows one `import_sample_bank` call writes and publishes: the items and the case study
 * together, so the whole sample lands at once or not at all and costs one import against the
 * author's limit. Refused unless every part is one the editor would publish (#283).
 */
export function sampleImport(): { ok: true; rows: ImportRows } | { ok: false; errors: string[] } {
  const { items, caseStudy } = sampleSet();
  const problems = samplePublishProblems({ items, caseStudy });
  if (problems.length > 0) return { ok: false, errors: problems };
  const parsedItems = parseImport(JSON.stringify({ format: LEARN_FORMAT, items }));
  const parsedCase = parseImport(JSON.stringify({ format: LEARN_FORMAT, caseStudy }));
  if (!parsedItems.ok) return { ok: false, errors: parsedItems.errors };
  if (!parsedCase.ok) return { ok: false, errors: parsedCase.errors };
  return {
    ok: true,
    rows: {
      items: importRowsFor(parsedItems).items,
      caseStudy: importRowsFor(parsedCase).caseStudy,
    },
  };
}
