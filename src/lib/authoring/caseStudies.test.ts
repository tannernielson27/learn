import { describe, expect, it, vi } from "vitest";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { validateCaseStudy } from "@/lib/ngn/validate";
import { toCaseStudyRow } from "@/lib/supabase/itemRows";
import {
  CASE_STUDY_ERRORS,
  createCaseStudy,
  emptyRecord,
  placeStep,
  publishCaseStudy,
  reorderSteps,
  saveRecord,
} from "./caseStudies";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/**
 * A chainable stand-in for the Supabase client. Each call to `from(table)` records the table and
 * every method called on it, and resolves with the next queued result for that table.
 */
function fakeClient(queue: Record<string, Result[]> = {}, rpcResult: Result = { error: null }) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const next = (table: string): Result => queue[table]?.shift() ?? { data: [], error: null };
  const from = vi.fn((table: string) => {
    const result = next(table);
    const chain: Record<string, unknown> = {};
    for (const method of ["insert", "update", "select", "eq", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.single = async () => result;
    chain.maybeSingle = async () => result;
    // Awaiting the chain itself (an insert or update with no terminal call) resolves too.
    chain.then = (resolve: (value: Result) => unknown) => resolve(result);
    return chain;
  });
  const rpc = vi.fn(async () => rpcResult);
  return { client: { from, rpc } as never, from, rpc, calls };
}

const CASE_ID = "3f8a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const BANK_ID = "00000000-0000-4000-8000-000000000002";
const ORG_ID = "00000000-0000-4000-8000-000000000001";

/** The sample case study as stored rows, every step published. */
function storedCaseStudy(stepsPlaced = 6) {
  const caseStudy = validateCaseStudy(sampleCaseStudy);
  if (!caseStudy.ok) throw new Error("sample case study must be valid");
  const row = toCaseStudyRow(caseStudy.value);
  return {
    id: caseStudy.value.id,
    title: row.title,
    tags: row.tags,
    ehr: row.ehr,
    case_study_items: row.items.slice(0, stepsPlaced).map((item, index) => ({
      position: index + 1,
      item_id: `item_${index + 1}`,
      items: { ...item, id: `item_${index + 1}`, status: "published" },
    })),
  };
}

describe("createCaseStudy", () => {
  it("inserts a draft in the bank with an empty record, and returns its id", async () => {
    const fake = fakeClient({ case_studies: [{ data: { id: CASE_ID }, error: null }] });
    const result = await createCaseStudy(fake.client, {
      bankId: BANK_ID,
      orgId: ORG_ID,
      userId: "user-1",
      title: "Sepsis",
    });
    expect(result).toEqual({ ok: true, value: { id: CASE_ID } });
    const insert = fake.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      bank_id: BANK_ID,
      org_id: ORG_ID,
      title: "Sepsis",
      status: "draft",
      ehr: emptyRecord(),
    });
  });

  it("says it could not be saved when the insert fails", async () => {
    const fake = fakeClient({ case_studies: [{ data: null, error: { message: "denied" } }] });
    const result = await createCaseStudy(fake.client, {
      bankId: BANK_ID,
      orgId: ORG_ID,
      userId: "user-1",
      title: "Sepsis",
    });
    expect(result).toEqual({ ok: false, error: CASE_STUDY_ERRORS.failed });
  });

  it("leaves the fictional patient's sex for the author to choose", () => {
    expect(emptyRecord()).toMatchObject({ patientHeader: { age: 0, setting: "" }, tabs: [] });
    expect((emptyRecord() as { patientHeader: object }).patientHeader).not.toHaveProperty("sex");
  });
});

describe("saveRecord", () => {
  it("refuses an oversized record before writing anything", async () => {
    const fake = fakeClient();
    const result = await saveRecord(fake.client, CASE_ID, { notes: "x".repeat(210_000) });
    expect(result).toEqual({ ok: false, error: CASE_STUDY_ERRORS.tooLarge });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("says the case study is gone when no row was updated", async () => {
    const fake = fakeClient({ case_studies: [{ data: [], error: null }] });
    expect(await saveRecord(fake.client, CASE_ID, emptyRecord())).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.gone,
    });
  });

  it("saves the record as a draft", async () => {
    const fake = fakeClient({ case_studies: [{ data: [{ id: CASE_ID }], error: null }] });
    expect(await saveRecord(fake.client, CASE_ID, emptyRecord())).toEqual({
      ok: true,
      value: undefined,
    });
    const update = fake.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toMatchObject({ status: "draft" });
  });
});

describe("placeStep", () => {
  const step = { caseStudyId: CASE_ID, position: 3 as const, itemId: "item_9" };

  // One database call does the insert or replacement and the item's CJMM step together, so a
  // failure can never leave a step placed with its item marked for another step.
  it("places or replaces the item at a step in one database call, writing nothing else", async () => {
    const fake = fakeClient();
    expect(await placeStep(fake.client, step)).toEqual({ ok: true, value: undefined });
    expect(fake.rpc).toHaveBeenCalledWith("place_case_study_step", {
      target: CASE_ID,
      step_position: 3,
      step_item: "item_9",
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("explains an item from another bank, which the database's keys refuse", async () => {
    const fake = fakeClient({}, { error: { code: "23503" } });
    expect(await placeStep(fake.client, step)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.wrongBank,
    });
  });

  it("explains an item that is already another step of this case study", async () => {
    const fake = fakeClient({}, { error: { code: "23505" } });
    expect(await placeStep(fake.client, step)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.alreadyStep,
    });
  });

  it("gives the plain failure for anything else, such as a case study it cannot see", async () => {
    const fake = fakeClient({}, { error: { code: "22023" } });
    expect(await placeStep(fake.client, step)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.failed,
    });
  });
});

describe("reorderSteps", () => {
  it("moves every step through the database function in one call", async () => {
    const fake = fakeClient();
    expect(await reorderSteps(fake.client, CASE_ID, ["b", "a"])).toEqual({
      ok: true,
      value: undefined,
    });
    expect(fake.rpc).toHaveBeenCalledWith("reorder_case_study_steps", {
      target: CASE_ID,
      item_ids: ["b", "a"],
    });
  });

  it("says the steps could not be reordered when the function refuses", async () => {
    const fake = fakeClient({}, { error: { code: "22023" } });
    expect(await reorderSteps(fake.client, CASE_ID, ["a"])).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.badOrder,
    });
  });
});

describe("publishCaseStudy", () => {
  it("says the case study is gone when it cannot be read", async () => {
    const fake = fakeClient({ case_studies: [{ data: null, error: null }] });
    expect(await publishCaseStudy(fake.client, CASE_ID)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.gone,
    });
  });

  it("returns the plain reasons for each missing step and publishes nothing", async () => {
    const fake = fakeClient({ case_studies: [{ data: storedCaseStudy(4), error: null }] });
    const result = await publishCaseStudy(fake.client, CASE_ID);
    expect(result).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.notReady,
      blockers: [
        "Step 5 (Take Action) has no item yet.",
        "Step 6 (Evaluate Outcomes) has no item yet.",
      ],
    });
    expect(fake.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("publishes a complete case study whose six steps are published, valid items", async () => {
    const fake = fakeClient({
      case_studies: [
        { data: storedCaseStudy(6), error: null },
        { data: [{ id: CASE_ID }], error: null },
      ],
    });
    expect(await publishCaseStudy(fake.client, CASE_ID)).toEqual({ ok: true, value: undefined });
    const update = fake.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ status: "published" });
  });
});
