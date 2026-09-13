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
  assembleCaseStudy,
  pinnedStepFor,
  saveRecord,
  saveRecordForm,
  startStep,
} from "./caseStudies";
import { DRAFT_ERROR } from "./forms/draft";
import { toEhrForm } from "./forms/ehr";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";

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
    for (const method of ["insert", "update", "delete", "select", "eq", "order", "limit"]) {
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
    expect(emptyRecord()).toMatchObject({ patientHeader: { setting: "" }, tabs: [] });
    // Neither is guessed: an age of 0 would read as a newborn in the record editor (#87).
    expect((emptyRecord() as { patientHeader: object }).patientHeader).not.toHaveProperty("sex");
    expect((emptyRecord() as { patientHeader: object }).patientHeader).not.toHaveProperty("age");
  });
});

describe("pinnedStepFor", () => {
  it("is the item's position in its case study", async () => {
    const fake = fakeClient({ case_study_items: [{ data: { position: 4 }, error: null }] });
    expect(await pinnedStepFor(fake.client, "item-1")).toBe(4);
    expect(fake.calls).toContainEqual({
      table: "case_study_items",
      method: "eq",
      args: ["item_id", "item-1"],
    });
  });

  it("is null for an item that is not a step, or when the read fails", async () => {
    const none = fakeClient({ case_study_items: [{ data: null, error: null }] });
    expect(await pinnedStepFor(none.client, "item-2")).toBeNull();
    const failed = fakeClient({ case_study_items: [{ data: null, error: { message: "x" } }] });
    expect(await pinnedStepFor(failed.client, "item-3")).toBeNull();
  });
});

describe("startStep", () => {
  const args = {
    caseStudyId: CASE_ID,
    position: 2 as const,
    type: "multiple_choice" as const,
    userId: "user-1",
  };
  const caseStudyRow = { data: { bank_id: BANK_ID, org_id: ORG_ID }, error: null };

  it("says the case study is gone when it cannot be read", async () => {
    const fake = fakeClient({ case_studies: [{ data: null, error: null }] });
    expect(await startStep(fake.client, args)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.gone,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("starts a draft of the type in the case study's bank, pinned to the step, and places it", async () => {
    const fake = fakeClient({
      case_studies: [caseStudyRow],
      case_study_items: [{ data: null, error: null }],
      items: [{ data: { id: "new-item" }, error: null }],
    });
    expect(await startStep(fake.client, args)).toEqual({ ok: true, value: { itemId: "new-item" } });
    const insert = fake.calls.find((call) => call.table === "items" && call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      bank_id: BANK_ID,
      org_id: ORG_ID,
      type: "multiple_choice",
      status: "draft",
      cjmm_step: 2,
      created_by: "user-1",
    });
    expect(fake.rpc).toHaveBeenCalledWith("place_case_study_step", {
      target: CASE_ID,
      step_position: 2,
      step_item: "new-item",
    });
    expect(fake.calls.some((call) => call.method === "delete")).toBe(false);
    // A published case study with a new, unfinished step is not ready any more.
    expect(fake.calls).toContainEqual({
      table: "case_studies",
      method: "update",
      args: [{ status: "draft" }],
    });
  });

  it("removes the new item again when it cannot be placed", async () => {
    const fake = fakeClient(
      {
        case_studies: [caseStudyRow],
        case_study_items: [{ data: null, error: null }],
        items: [{ data: { id: "new-item" }, error: null }],
      },
      { error: { code: "23505" } },
    );
    expect(await startStep(fake.client, args)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.alreadyStep,
    });
    expect(fake.calls).toContainEqual({ table: "items", method: "delete", args: [] });
    expect(fake.calls).toContainEqual({ table: "items", method: "eq", args: ["id", "new-item"] });
  });

  it("changing a step's type replaces its item and removes the old one only if it is a draft", async () => {
    const fake = fakeClient({
      case_studies: [caseStudyRow],
      case_study_items: [{ data: { item_id: "old-item" }, error: null }],
      items: [{ data: { id: "new-item" }, error: null }],
    });
    expect(await startStep(fake.client, args)).toEqual({ ok: true, value: { itemId: "new-item" } });
    expect(fake.calls).toContainEqual({ table: "items", method: "eq", args: ["id", "old-item"] });
    expect(fake.calls).toContainEqual({ table: "items", method: "eq", args: ["status", "draft"] });
  });

  it("says it failed, and places nothing, when the item cannot be created", async () => {
    const fake = fakeClient({
      case_studies: [caseStudyRow],
      case_study_items: [{ data: null, error: null }],
      items: [{ data: null, error: { message: "denied" } }],
    });
    expect(await startStep(fake.client, args)).toEqual({
      ok: false,
      error: CASE_STUDY_ERRORS.failed,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("assembleCaseStudy", () => {
  it("assembles a preview from finished steps whose items are still drafts", () => {
    const row = storedCaseStudy();
    const drafts = {
      ...row,
      case_study_items: row.case_study_items.map((step) => ({
        ...step,
        items: { ...step.items, status: "draft" },
      })),
    };
    const result = assembleCaseStudy(drafts, "preview");
    expect(result.ok).toBe(true);
    expect(result.ok && result.caseStudy.items.map((item) => item.cjmmStep)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("names what a preview still needs", () => {
    expect(assembleCaseStudy(storedCaseStudy(5), "preview")).toEqual({
      ok: false,
      blockers: ["Step 6 (Evaluate Outcomes) has no item yet."],
    });
  });

  it("for publishing, still requires every step item to be published", () => {
    const row = storedCaseStudy();
    const firstDraft = {
      ...row,
      case_study_items: row.case_study_items.map((step, index) =>
        index === 0 ? { ...step, items: { ...step.items, status: "draft" } } : step,
      ),
    };
    expect(assembleCaseStudy(firstDraft, "publish")).toEqual({
      ok: false,
      blockers: ["Step 1 (Recognize Cues) needs its item finished and published."],
    });
    expect(assembleCaseStudy(row, "publish").ok).toBe(true);
  });
});

describe("saveRecordForm", () => {
  it("refuses an oversized request before parsing or writing anything", async () => {
    const fake = fakeClient();
    const result = await saveRecordForm(fake.client, CASE_ID, { junk: "x".repeat(250_000) });
    expect(result).toEqual({ ok: false, error: CASE_STUDY_ERRORS.tooLarge });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("refuses anything that is not the record form, before writing anything", async () => {
    const fake = fakeClient();
    const result = await saveRecordForm(fake.client, CASE_ID, { patient: "x" });
    expect(result).toEqual({ ok: false, error: DRAFT_ERROR });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("stores the record the form describes", async () => {
    const fake = fakeClient({ case_studies: [{ data: [{ id: CASE_ID }], error: null }] });
    const result = await saveRecordForm(fake.client, CASE_ID, toEhrForm(sampleEhr));
    expect(result).toEqual({ ok: true, value: undefined });
    const update = fake.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toMatchObject({ ehr: sampleEhr });
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
