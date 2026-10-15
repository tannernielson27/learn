import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  AI_IMPORT_BATCH_LIMIT,
  beginParsing,
  checkUpload,
  finishBatch,
  registerUpload,
  removeUpload,
  startBatch,
  type ActionDeps,
} from "./actions";
import {
  BANK,
  BATCH,
  FILE,
  OFF,
  ON,
  ORG,
  USER,
  fakeClient,
  teacher,
  type Reply,
} from "./testing/fakeSupabase";

const finishExtraction = vi.hoisted(() => vi.fn());
vi.mock("../finish", () => ({ finishExtraction }));

const batchRow = (status: string): Reply => ({ data: { id: BATCH, status, bank_id: BANK } });

function deps(
  author: RouteAuthor,
  tables: Record<string, Reply[]> = {},
  env: Record<string, string> = ON,
) {
  const service = fakeClient(tables);
  const limiter = createMemoryRateLimitStore();
  const value: ActionDeps = {
    author: async () => author,
    env,
    service: () => service.client,
    limiter: () => limiter,
  };
  return { deps: value, service, limiter };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  finishExtraction.mockReset();
});
afterEach(() => errorSpy.mockRestore());

describe("startBatch", () => {
  const session = (extra: Record<string, Reply[]>) => teacher(true, extra);

  it("makes a batch in the teacher's workspace with the teacher's own session", async () => {
    const { author, session: own } = session({
      item_banks: [{ data: { id: BANK } }],
      ai_import_batches: [{ data: { id: BATCH } }],
    });
    const { deps: d, limiter } = deps(author);
    expect(await startBatch(d, BANK, true)).toEqual({ ok: true, batchId: BATCH });
    expect(own.stepsOn("ai_import_batches", "insert")).toEqual([[{ org_id: ORG, bank_id: BANK }]]);
    expect(limiter.hits()).toEqual([{ bucket: "ai_import_batch", key: USER }]);
  });

  it("requires the rights confirmation and makes nothing without it", async () => {
    const { author, session: own } = session({});
    const result = await startBatch(deps(author).deps, BANK, false);
    expect(result).toMatchObject({ ok: false, code: "rights" });
    expect(own.stepsOn("ai_import_batches", "insert")).toEqual([]);
  });

  it.each([
    ["anon", { status: "signed_out" } as RouteAuthor, "signed_out"],
    ["a student", { status: "forbidden", role: "student" } as RouteAuthor, "forbidden"],
    ["a workspace with AI import off", teacher(false).author, "disabled"],
  ])("refuses %s", async (_name, author, code) => {
    expect(await startBatch(deps(author).deps, BANK, true)).toMatchObject({ ok: false, code });
  });

  it("refuses with AI import off for the deployment", async () => {
    expect(await startBatch(deps(teacher().author, {}, OFF).deps, BANK, true)).toMatchObject({
      code: "disabled",
    });
  });

  it("does not find another workspace's quiz (RLS hides it)", async () => {
    const { author } = session({ item_banks: [{ data: null }] });
    expect(await startBatch(deps(author).deps, BANK, true)).toMatchObject({ code: "not_found" });
  });

  it("names the 20-open limit and refuses past the hourly limit", async () => {
    const { author } = session({
      item_banks: [{ data: { id: BANK } }],
      ai_import_batches: [{ data: null, error: { code: "23514" } }],
    });
    expect(await startBatch(deps(author).deps, BANK, true)).toMatchObject({
      code: "too_many_open",
    });

    const limited = session({ item_banks: [{ data: { id: BANK } }] });
    const { deps: d, limiter } = deps(limited.author);
    for (let i = 0; i < AI_IMPORT_BATCH_LIMIT.attempts; i += 1) {
      await limiter.hit("ai_import_batch", USER, AI_IMPORT_BATCH_LIMIT);
    }
    expect(await startBatch(d, BANK, true)).toMatchObject({ code: "rate_limited" });
  });
});

describe("files", () => {
  it("registers a file only in the teacher's own workspace's batch", async () => {
    const { deps: d, service } = deps(teacher().author, {
      ai_import_batches: [batchRow("uploading")],
      ai_import_files: [{ data: { id: FILE, storage_path: `${ORG}/${BATCH}/${FILE}` } }],
    });
    expect(await registerUpload(d, BATCH, "Cardiac quiz.md")).toEqual({
      ok: true,
      fileId: FILE,
      storagePath: `${ORG}/${BATCH}/${FILE}`,
      contentType: "text/markdown",
      name: "Cardiac quiz.md",
    });
    expect(service.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", ORG]);
    expect(service.stepsOn("ai_import_files", "insert")[0]?.[0]).toMatchObject({ org_id: ORG });
  });

  it("does not find another workspace's batch, and touches no file", async () => {
    const { deps: d, service } = deps(teacher().author, { ai_import_batches: [{ data: null }] });
    expect(await registerUpload(d, BATCH, "a.md")).toMatchObject({ code: "not_found" });
    expect(
      await checkUpload(
        deps(teacher().author, { ai_import_batches: [{ data: null }] }).deps,
        BATCH,
        FILE,
      ),
    ).toMatchObject({ code: "not_found" });
    expect(service.left()).toEqual([]);
  });

  it.each([
    ["anon", { status: "signed_out" } as RouteAuthor, "signed_out"],
    ["a student", { status: "forbidden" } as RouteAuthor, "forbidden"],
  ])("refuses %s before reading anything", async (_name, author, code) => {
    const { deps: d, service } = deps(author);
    expect(await registerUpload(d, BATCH, "a.md")).toMatchObject({ code });
    expect(await removeUpload(d, BATCH, FILE)).toMatchObject({ code });
    expect(await checkUpload(d, BATCH, FILE)).toMatchObject({ code });
    expect(service.from).not.toHaveBeenCalled();
  });

  it("refuses a name it cannot import, with the reason", async () => {
    const { deps: d } = deps(teacher().author, { ai_import_batches: [batchRow("uploading")] });
    const result = await registerUpload(d, BATCH, "old.doc");
    expect(result).toMatchObject({ ok: false, code: "legacy_doc" });
  });

  it("refuses files for a batch that is no longer uploading", async () => {
    const { deps: d } = deps(teacher().author, { ai_import_batches: [batchRow("parsing")] });
    expect(await registerUpload(d, BATCH, "a.md")).toMatchObject({ code: "batch_closed" });
  });

  it("refuses ids that are not ids", async () => {
    const { deps: d } = deps(teacher().author, {
      ai_import_batches: [batchRow("uploading"), batchRow("uploading")],
    });
    expect(await checkUpload(d, BATCH, "nope")).toMatchObject({ code: "not_found" });
    expect(await removeUpload(d, BATCH, "nope")).toMatchObject({ code: "not_found" });
    expect(await registerUpload(d, "nope", "a.md")).toMatchObject({ code: "not_found" });
  });

  it("answers a refused file with its reason, as checked before", async () => {
    const { deps: d } = deps(teacher().author, {
      ai_import_batches: [batchRow("uploading")],
      ai_import_files: [
        {
          data: {
            id: FILE,
            original_name: "a.md",
            status: "rejected",
            kind: null,
            pages: null,
            rejected_reason: "The file is empty.",
            storage_path: "p",
          },
        },
      ],
    });
    expect(await checkUpload(d, BATCH, FILE)).toEqual({
      ok: true,
      status: "rejected",
      reason: "The file is empty.",
    });
  });
});

const view = (fileStatus: string): Record<string, Reply[]> => ({
  ai_import_files: [
    {
      data: [
        { id: FILE, original_name: "a.md", status: fileStatus, rejected_reason: null, pages: 1 },
      ],
    },
  ],
  ai_import_chunks: [{ data: [{ file_id: FILE, position: 0, status: "pending" }] }],
  ai_import_entries: [{ data: [] }],
});

describe("beginParsing", () => {
  it("moves an uploaded batch to parsing and answers its files", async () => {
    const first = view("ready");
    const second = view("ready");
    const { deps: d, service } = deps(teacher().author, {
      ai_import_batches: [
        batchRow("uploading"),
        { data: { id: BATCH, status: "uploading" } },
        { data: null },
        { data: { id: BATCH, status: "parsing" } },
      ],
      ai_import_files: [...first.ai_import_files!, ...second.ai_import_files!],
      ai_import_chunks: [...first.ai_import_chunks!, ...second.ai_import_chunks!],
      ai_import_entries: [...first.ai_import_entries!, ...second.ai_import_entries!],
    });
    const result = await beginParsing(d, BATCH);
    expect(result).toMatchObject({ ok: true, batch: { id: BATCH, status: "parsing" } });
    expect(service.stepsOn("ai_import_batches", "update")).toEqual([[{ status: "parsing" }]]);
  });

  it("refuses while a file is still pending, or when no file is ready", async () => {
    const pending = deps(teacher().author, {
      ai_import_batches: [batchRow("uploading"), { data: { id: BATCH, status: "uploading" } }],
      ...view("pending"),
    });
    expect(await beginParsing(pending.deps, BATCH)).toMatchObject({ code: "pending_files" });
    const none = deps(teacher().author, {
      ai_import_batches: [batchRow("uploading"), { data: { id: BATCH, status: "uploading" } }],
      ...view("rejected"),
    });
    expect(await beginParsing(none.deps, BATCH)).toMatchObject({ code: "no_files" });
  });

  it("refuses a batch in review", async () => {
    const { deps: d } = deps(teacher().author, { ai_import_batches: [batchRow("review")] });
    expect(await beginParsing(d, BATCH)).toMatchObject({ code: "not_parsing" });
  });
});

describe("finishBatch", () => {
  it("refuses while a chunk is unread", async () => {
    const { deps: d } = deps(teacher().author, {
      ai_import_batches: [batchRow("parsing")],
      ai_import_chunks: [{ count: 1 }],
    });
    expect(await finishBatch(d, BATCH)).toMatchObject({ code: "incomplete" });
    expect(finishExtraction).not.toHaveBeenCalled();
  });

  it("finishes the extraction in the caller's workspace, then moves the batch to review", async () => {
    finishExtraction.mockResolvedValue({ ok: true, duplicates: 0 });
    const { deps: d, service } = deps(teacher().author, {
      ai_import_batches: [batchRow("parsing"), { data: null }],
      ai_import_chunks: [{ count: 0 }],
    });
    expect(await finishBatch(d, BATCH)).toEqual({ ok: true });
    expect(finishExtraction).toHaveBeenCalledWith(service.client, { orgId: ORG, batchId: BATCH });
    expect(service.stepsOn("ai_import_batches", "update")).toEqual([[{ status: "review" }]]);
  });

  it("answers a batch already in review as done, and refuses another workspace's", async () => {
    const review = deps(teacher().author, { ai_import_batches: [batchRow("review")] });
    expect(await finishBatch(review.deps, BATCH)).toEqual({ ok: true });
    const other = deps(teacher().author, { ai_import_batches: [{ data: null }] });
    expect(await finishBatch(other.deps, BATCH)).toMatchObject({ code: "not_found" });
  });
});
