import {
  importRowsFor,
  LEARN_FORMAT,
  parseImport,
  type ImportRows,
} from "@/lib/authoring/transfer";
import { FIXTURES, sampleCaseStudy, sampleTrendItem } from "@/lib/ngn/fixtures";
import { ITEM_TYPES } from "@/lib/ngn/labels";

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
 * The rows one `import_bank_content` call writes: the items and the case study together, so the
 * whole sample lands at once or not at all and costs one import against the author's limit.
 */
export function sampleImport(): { ok: true; rows: ImportRows } | { ok: false; errors: string[] } {
  const { items, caseStudy } = sampleSet();
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
