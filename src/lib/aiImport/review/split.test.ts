import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema } from "@/lib/ngn/schemas";
import { REMOVED_REASON } from "../files/reasons";
import {
  BATCH,
  OFF,
  ON,
  ORG,
  fakeClient,
  teacher,
  type Reply,
} from "../upload/testing/fakeSupabase";
import { readStoredReasons, restoredStatus } from "@/lib/authoring/aiImportReview";
import { splitCaseStudy, type SplitDeps } from "./split";

const ENTRY = "00000000-0000-4000-8000-0000000000e1";
const CHUNK = "00000000-0000-4000-8000-0000000000c9";
const TITLE = "Pulmonary embolism";

// The fictional sample case study, with step 4's key taken out as staging leaves an unmarked one.
const whole = caseStudySchema.parse(sampleCaseStudy);
const staged = {
  ...whole,
  items: whole.items.map((item, index) => {
    if (index !== 3) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
  }),
};

const row = (over: Record<string, unknown> = {}): Reply => ({
  data: {
    id: ENTRY,
    version: 3,
    position: 1002,
    kind: "case_study",
    type: null,
    status: "needs_answer",
    reasons: [
      "needs_answer: Step 4: The source marks no answer. Add the key before this question can be imported.",
    ],
    source_excerpt: "A 74-year-old woman, post-operative day 1.",
    item: staged,
    draft: null,
    group_key: TITLE,
    step: null,
    chunk_id: CHUNK,
    ...over,
  },
});
const inReview: Reply = { data: { status: "review" } };
const places = (positions: number[]): Reply => ({
  data: positions.map((position) => ({ position })),
});
const NEW_IDS = ["n2", "n3", "n4", "n5", "n6"];

const INSERTED: Reply = { data: NEW_IDS.map((id) => ({ id })) };
const LEAD: Reply = { data: [{ version: 4 }] };
// Step 4 has no key; the other four inserted steps are ready.
const READY: Reply = { data: ["n2", "n3", "n5", "n6"].map((id) => ({ id })) };
const UNANSWERED: Reply = { data: [{ id: "n4" }] };
// The duplicate pass reads the batch's stems and finds nothing to change.
const NO_STEMS: Reply = { data: [] };
const FAILS: Reply = { error: { code: "XX000" } };

function setup(
  options: {
    entry?: Reply;
    taken?: number[];
    batches?: Reply[];
    files?: Reply;
    chunk?: Reply;
    serviceBatches?: Reply[];
    /**
     * In order: (a) the insert, (b) the case study's own row, then either the undo or (c) one
     * write for each status among steps 2 to 6, and last the duplicate pass's read.
     */
    serviceEntries?: Reply[];
    enabled?: boolean;
    env?: Record<string, string>;
  } = {},
) {
  const { author, session } = teacher(options.enabled ?? true, {
    ai_import_entries: [options.entry ?? row(), places(options.taken ?? [1000, 1001, 1002, 1008])],
    ai_import_batches: options.batches ?? [inReview],
    ai_import_files: [
      options.files ?? {
        data: [
          { status: "ready", rejected_reason: null },
          { status: "ready", rejected_reason: null },
        ],
      },
    ],
    ai_import_chunks: [options.chunk ?? { data: { page_from: null } }],
  });
  const service = fakeClient({
    ai_import_batches: options.serviceBatches ?? [inReview],
    ai_import_entries: options.serviceEntries ?? [INSERTED, LEAD, READY, UNANSWERED, NO_STEMS],
    ai_import_files: [{ data: [] }],
  });
  const deps: SplitDeps = {
    author: async () => author,
    env: options.env ?? ON,
    service: () => service.client,
  };
  return { deps, session, service };
}

const input = (over: Record<string, unknown> = {}) => ({
  batchId: BATCH,
  entryId: ENTRY,
  version: 3,
  ...over,
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("splitCaseStudy (#593)", () => {
  it("replaces the case study with six questions, in the places its steps never used", async () => {
    const { deps, session, service } = setup();
    expect(await splitCaseStudy(deps, input())).toEqual({ ok: true, questions: 6 });

    // Read with the teacher's own session, every read naming the workspace; nothing written by it.
    for (const table of ["ai_import_entries", "ai_import_batches", "ai_import_files"]) {
      expect(session.stepsOn(table, "eq")).toContainEqual(["org_id", ORG]);
    }
    expect(session.stepsOn("ai_import_entries", "insert")).toEqual([]);
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);

    // Steps 2 to 6 go in first, inside the file's thousand and around the place already taken.
    const [[inserted]] = service.stepsOn("ai_import_entries", "insert") as [
      [Record<string, unknown>[]],
    ];
    expect(inserted.map((r) => r.position)).toEqual([1003, 1004, 1005, 1006, 1007]);
    expect(inserted.map((r) => r.step)).toEqual([2, 3, 4, 5, 6]);
    for (const r of inserted) {
      expect(r).toMatchObject({
        batch_id: BATCH,
        org_id: ORG,
        kind: "item",
        chunk_id: CHUNK,
        group_key: TITLE,
        source_excerpt: "A 74-year-old woman, post-operative day 1.",
      });
      expect(r.reasons).toContain(
        `note: Split from the case study "${TITLE}". The patient record was not attached.`,
      );
    }
    // (a) They go in dropped, so nothing can import them beside the case study meanwhile.
    expect(inserted.map((r) => r.status)).toEqual(Array(5).fill("dropped"));
    expect(itemSchema.safeParse(inserted[0]!.item).success).toBe(true);

    // (b) Then the case study's own row becomes step 1, only where it is still at the shown
    // version, and (c) the five take their own statuses, one write for each status.
    const [[lead], [ready], [unanswered]] = service.stepsOn("ai_import_entries", "update") as [
      [Record<string, unknown>],
      [unknown],
      [unknown],
    ];
    expect(lead).toMatchObject({ kind: "item", type: "highlight_text", status: "ready", step: 1 });
    expect([ready, unanswered]).toEqual([{ status: "ready" }, { status: "needs_answer" }]);
    expect(service.stepsOn("ai_import_entries", "in")).toEqual([
      ["id", ["n2", "n3", "n5", "n6"]],
      ["id", ["n4"]],
    ]);
    expect(service.left()).toEqual([]);
    expect(service.stepsOn("ai_import_entries", "eq")).toEqual(
      expect.arrayContaining([
        ["id", ENTRY],
        ["batch_id", BATCH],
        ["org_id", ORG],
        ["version", 3],
      ]),
    );
    expect(service.stepsOn("ai_import_batches", "eq")).toEqual([
      ["id", BATCH],
      ["org_id", ORG],
    ]);
  });

  it("stops after (a) with nothing written but what failed", async () => {
    const { deps, service } = setup({ serviceEntries: [FAILS] });
    expect(await splitCaseStudy(deps, input())).toMatchObject({ code: "unavailable" });
    expect(service.stepsOn("ai_import_entries", "update")).toEqual([]);
  });

  it("takes the dropped steps out again when the case study changed under it at (b)", async () => {
    const { deps, service } = setup({
      serviceEntries: [INSERTED, { data: [] }, { data: null }, NO_STEMS],
    });
    expect(await splitCaseStudy(deps, input())).toMatchObject({ code: "entry_changed" });
    expect(service.stepsOn("ai_import_entries", "delete")).toHaveLength(1);
    expect(service.stepsOn("ai_import_entries", "in")).toEqual([["id", NEW_IDS]]);
    // The flags are worked out again on this path too.
    expect(service.left()).toEqual([]);
  });

  it("leaves only dropped rows when the undo fails as well", async () => {
    const { deps, service } = setup({ serviceEntries: [INSERTED, { data: [] }, FAILS, NO_STEMS] });
    expect(await splitCaseStudy(deps, input())).toMatchObject({ code: "entry_changed" });
    const [[inserted]] = service.stepsOn("ai_import_entries", "insert") as [[{ status: string }[]]];
    // Whatever is left of the split is dropped: seen under Dropped, and never imported.
    expect(inserted.every((r) => r.status === "dropped")).toBe(true);
    expect(service.stepsOn("ai_import_entries", "update")).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith("[ai-import] undoing a split failed", { code: "XX000" });
  });

  it("says in words what is under Dropped when (c) fails for some steps", async () => {
    const { deps, service } = setup({
      serviceEntries: [INSERTED, LEAD, FAILS, UNANSWERED, NO_STEMS],
    });
    expect(await splitCaseStudy(deps, input())).toEqual({
      ok: false,
      code: "split_partial",
      message: "The case study was split, but 4 of its questions are under Dropped. Restore them.",
    });
    // Each still has the reasons a restore works its status out from.
    const [[inserted]] = service.stepsOn("ai_import_entries", "insert") as [
      [{ reasons: string[]; item: unknown; type: string }[]],
    ];
    expect(
      restoredStatus({
        kind: "item",
        type: inserted[2]!.type,
        item: inserted[2]!.item,
        reasons: readStoredReasons(inserted[2]!.reasons),
      }),
    ).toBe("needs_answer");
    expect(service.left()).toEqual([]);
  });

  it("counts a step whose write matched no row, and says one as one", async () => {
    const { deps } = setup({
      serviceEntries: [INSERTED, LEAD, READY, { data: [] }, NO_STEMS],
    });
    expect(await splitCaseStudy(deps, input())).toMatchObject({
      code: "split_partial",
      message: "The case study was split, but 1 of its questions is under Dropped. Restore it.",
    });
  });

  it("refuses in words a split that would pass the batch's 150 entries", async () => {
    const full = Array.from({ length: 146 }, (_, index) => 1000 + index);
    const { deps, service } = setup({ taken: full });
    const result = await splitCaseStudy(deps, input());
    expect(result).toMatchObject({ ok: false, code: "split_too_many" });
    expect((result as { message: string }).message).toMatch(/at most 150 questions/);
    expect(service.from).not.toHaveBeenCalled();
    // 145 leaves room for exactly five more.
    const room = setup({ taken: full.slice(0, 145) });
    expect(await splitCaseStudy(room.deps, input())).toMatchObject({ ok: true });
  });

  it("refuses when the file's thousand has no five places left", async () => {
    const { deps, service } = setup({ entry: row({ position: 1997 }), taken: [1997] });
    expect(await splitCaseStudy(deps, input())).toMatchObject({ code: "cannot_split" });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("splits only a case study that has not been dropped, at the version shown", async () => {
    const question = setup({ entry: row({ kind: "item", type: "multiple_choice" }) });
    expect(await splitCaseStudy(question.deps, input())).toMatchObject({ code: "not_splittable" });
    const dropped = setup({ entry: row({ status: "dropped" }) });
    expect(await splitCaseStudy(dropped.deps, input())).toMatchObject({ code: "not_splittable" });
    const stale = setup({ entry: row({ version: 4 }) });
    expect(await splitCaseStudy(stale.deps, input())).toMatchObject({ code: "entry_changed" });
    const unkept = setup({ entry: row({ item: null, draft: null }) });
    expect(await splitCaseStudy(unkept.deps, input())).toMatchObject({ code: "cannot_split" });
    for (const { service } of [question, dropped, stale, unkept]) {
      expect(service.from).not.toHaveBeenCalled();
    }
  });

  it("never writes at a removed file's place, nor outside a review", async () => {
    const removed = setup({
      files: {
        data: [
          { status: "ready", rejected_reason: null },
          { status: "rejected", rejected_reason: REMOVED_REASON },
        ],
      },
    });
    expect(await splitCaseStudy(removed.deps, input())).toMatchObject({ code: "not_found" });
    const imported = setup({ batches: [{ data: { status: "imported" } }] });
    expect(await splitCaseStudy(imported.deps, input())).toMatchObject({ code: "not_review" });
    // The batch left review between the teacher's read and the service client's write.
    const late = setup({ serviceBatches: [{ data: { status: "imported" } }] });
    expect(await splitCaseStudy(late.deps, input())).toMatchObject({ code: "not_review" });
    expect(late.service.stepsOn("ai_import_entries", "insert")).toEqual([]);
    const gone = setup({ entry: { data: null } });
    expect(await splitCaseStudy(gone.deps, input())).toMatchObject({ code: "not_found" });
  });

  it("asks for a check on keys read from a PDF, which its chunk's pages show", async () => {
    const { deps, service } = setup({
      entry: row({ item: whole, reasons: [] }),
      chunk: { data: { page_from: 3 } },
    });
    await splitCaseStudy(deps, input());
    const [[inserted]] = service.stepsOn("ai_import_entries", "insert") as [
      [{ reasons: string[] }[]],
    ];
    // A batch read before #593 does not say which keys went unchecked, so the chunk's pages do.
    expect(
      inserted.every((r) => r.reasons.some((reason) => reason.startsWith("check_key: "))),
    ).toBe(true);
  });

  it("checks the caller itself and the request's shape", async () => {
    const { deps } = setup();
    for (const bad of [null, {}, input({ batchId: "x" }), input({ version: 0 })]) {
      expect(await splitCaseStudy(deps, bad)).toMatchObject({ code: "malformed" });
    }
    const signedOut: SplitDeps = { ...deps, author: async () => ({ status: "signed_out" }) };
    expect(await splitCaseStudy(signedOut, input())).toMatchObject({ code: "signed_out" });
    const student: SplitDeps = { ...deps, author: async () => ({ status: "forbidden" }) };
    expect(await splitCaseStudy(student, input())).toMatchObject({ code: "forbidden" });
    expect(await splitCaseStudy(setup({ env: OFF }).deps, input())).toMatchObject({
      code: "not_found",
    });
    expect(await splitCaseStudy(setup({ enabled: false }).deps, input())).toMatchObject({
      code: "not_found",
    });
  });

  it("says so when a read or a write fails, and logs a code only", async () => {
    const readFails = setup({ entry: { error: { code: "XX000" } } });
    expect(await splitCaseStudy(readFails.deps, input())).toMatchObject({ code: "unavailable" });
    const chunkFails = setup({ chunk: { error: { code: "XX000" } } });
    expect(await splitCaseStudy(chunkFails.deps, input())).toMatchObject({ code: "unavailable" });
    const recheckFails = setup({ serviceBatches: [{ error: { code: "XX000" } }] });
    expect(await splitCaseStudy(recheckFails.deps, input())).toMatchObject({ code: "unavailable" });
    const insertFails = setup({ serviceEntries: [{ error: { code: "23505" } }] });
    expect(await splitCaseStudy(insertFails.deps, input())).toMatchObject({ code: "unavailable" });
    const leadFails = setup({ serviceEntries: [INSERTED, FAILS, FAILS, NO_STEMS] });
    expect(await splitCaseStudy(leadFails.deps, input())).toMatchObject({ code: "unavailable" });
    expect(errorSpy).toHaveBeenCalled();
    // Codes only: never the case study's words or a key.
    const logs = JSON.stringify(errorSpy.mock.calls);
    expect(logs).not.toContain("74-year-old");
    expect(logs).not.toContain("correctOptionIds");
  });
});
