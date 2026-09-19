import { describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { validateCaseStudy, validateItem } from "@/lib/ngn/validate";
import { toCaseStudyRow, toItemRow } from "@/lib/supabase/itemRows";
import {
  TRANSFER_ERRORS,
  importIntoBank,
  readCaseStudyExport,
  readItemExport,
} from "./importExport";
import { CASE_STUDY_WITH_STEPS } from "./caseStudies";
import { importRowsFor, parseImport } from "./transfer";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/** A chainable stand-in for the Supabase client, as in caseStudies.test.ts. */
function fakeClient(queue: Record<string, Result[]> = {}, rpcResult: Result = { error: null }) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const next = (table: string): Result => queue[table]?.shift() ?? { data: null, error: null };
  const from = vi.fn((table: string) => {
    const result = next(table);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => result;
    return chain;
  });
  const rpc = vi.fn(async () => rpcResult);
  return { client: { from, rpc } as never, from, rpc, calls };
}

const BANK_ID = "00000000-0000-4000-8000-000000000002";
const ITEM_ID = "00000000-0000-4000-8000-000000000010";

const validItem = () => {
  const result = validateItem(FIXTURES.multiple_choice.canonical);
  if (!result.ok) throw new Error("fixture must be valid");
  return result.value;
};
const validCaseStudy = () => {
  const result = validateCaseStudy(sampleCaseStudy);
  if (!result.ok) throw new Error("sample case study must be valid");
  return result.value;
};

describe("importIntoBank", () => {
  const rows = () => {
    const parsed = parseImport(JSON.stringify({ format: "learn.v1", items: [validItem()] }));
    if (!parsed.ok) throw new Error("should parse");
    return importRowsFor(parsed);
  };

  it("writes everything through the import function, in one call", async () => {
    const fake = fakeClient(
      {},
      { data: { item_ids: [ITEM_ID], case_study_id: null }, error: null },
    );
    const importRows = rows();
    expect(await importIntoBank(fake.client, BANK_ID, importRows)).toEqual({
      ok: true,
      value: { itemIds: [ITEM_ID], caseStudyId: null },
    });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("import_bank_content", {
      target_bank: BANK_ID,
      new_items: importRows.items,
      new_case_study: null,
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("says the bank is gone when the caller cannot see it", async () => {
    const fake = fakeClient({}, { data: null, error: { code: "22023" } });
    expect(await importIntoBank(fake.client, BANK_ID, rows())).toEqual({
      ok: false,
      error: TRANSFER_ERRORS.bankGone,
    });
  });

  it("says nothing was imported on any other failure", async () => {
    const fake = fakeClient({}, { data: null, error: { code: "23514" } });
    expect(await importIntoBank(fake.client, BANK_ID, rows())).toEqual({
      ok: false,
      error: TRANSFER_ERRORS.importFailed,
    });
  });
});

describe("readItemExport", () => {
  it("exports a valid stored item in the learn.v1 envelope", async () => {
    const original = validItem();
    const fake = fakeClient({
      items: [{ data: { ...toItemRow(original), id: ITEM_ID, status: "draft" }, error: null }],
    });
    expect(await readItemExport(fake.client, ITEM_ID)).toEqual({
      ok: true,
      envelope: { format: "learn.v1", items: [original] },
    });
  });

  it("is not found when the item cannot be read", async () => {
    const fake = fakeClient({ items: [{ data: null, error: null }] });
    expect(await readItemExport(fake.client, ITEM_ID)).toEqual({
      ok: false,
      status: 404,
      error: TRANSFER_ERRORS.notFound,
    });
  });

  it("refuses to export an unfinished item", async () => {
    const row = toItemRow(validItem());
    const unfinished = {
      ...row,
      content: { ...(row.content as object), stem: { kind: "markdown", value: "" } },
    };
    const fake = fakeClient({
      items: [{ data: { ...unfinished, id: ITEM_ID, status: "draft" }, error: null }],
    });
    expect(await readItemExport(fake.client, ITEM_ID)).toEqual({
      ok: false,
      status: 409,
      error: TRANSFER_ERRORS.unfinishedItem,
    });
  });
});

describe("readCaseStudyExport", () => {
  const storedRow = (stepsPlaced = 6) => {
    const caseStudy = validCaseStudy();
    const row = toCaseStudyRow(caseStudy);
    return {
      id: caseStudy.id,
      title: row.title,
      tags: row.tags,
      ehr: row.ehr,
      case_study_items: row.items.slice(0, stepsPlaced).map((item, index) => ({
        position: index + 1,
        item_id: `item_${index + 1}`,
        items: { ...item, status: "draft" },
      })),
    };
  };

  it("exports a case study whose steps are finished, drafts included", async () => {
    const fake = fakeClient({ case_studies: [{ data: storedRow(), error: null }] });
    expect(await readCaseStudyExport(fake.client, "case-1")).toEqual({
      ok: true,
      envelope: { format: "learn.v1", caseStudy: validCaseStudy() },
    });
    // The same select as the builder page and publish, so the three never drift apart.
    expect(fake.calls).toContainEqual({
      table: "case_studies",
      method: "select",
      args: [CASE_STUDY_WITH_STEPS],
    });
  });

  it("names what an unfinished case study still needs", async () => {
    const fake = fakeClient({ case_studies: [{ data: storedRow(5), error: null }] });
    expect(await readCaseStudyExport(fake.client, "case-1")).toEqual({
      ok: false,
      status: 409,
      error: TRANSFER_ERRORS.unfinishedCaseStudy,
      blockers: ["Step 6 (Evaluate Outcomes) has no item yet."],
    });
  });
});
