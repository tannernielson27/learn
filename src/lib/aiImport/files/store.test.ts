import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES } from "./limits";
import { REJECTIONS } from "./reasons";
import {
  AI_IMPORT_BUCKET,
  checkUploadedFile,
  cleanFileName,
  loadCheckedFile,
  registerFile,
  removeFile,
  uploadContentType,
} from "./store";
import { DOCM_MAIN, buildDocx, buildPdf, para } from "./testing/fixtures";

type Reply = {
  data?: unknown;
  error?: { code?: string; message?: string; status?: number; statusCode?: string } | null;
  count?: number;
};
type Client = Parameters<typeof registerFile>[0];

const ORG = "00000000-0000-4000-8000-0000000000a1";
const BATCH = "00000000-0000-4000-8000-0000000000b1";
const FILE = "00000000-0000-4000-8000-0000000000f1";
const PATH = `${ORG}/${BATCH}/${FILE}`;
const REF = { orgId: ORG, batchId: BATCH, fileId: FILE };

/**
 * A service client whose queries answer from a script, one reply per `from(table)` in order, and
 * which records every step so a test can check the filters.
 */
function fakeService(
  tables: Record<string, Reply[]>,
  storage: { download?: Reply; remove?: Reply } = {},
) {
  const calls: [string, string, unknown[]][] = [];
  const queues = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]));
  const from = vi.fn((table: string) => {
    const reply = queues[table]?.shift();
    if (!reply) throw new Error(`unexpected query on ${table}`);
    const builder: Record<string, unknown> = {};
    for (const step of ["select", "insert", "update", "delete", "eq", "single", "maybeSingle"]) {
      builder[step] = (...args: unknown[]) => {
        calls.push([table, step, args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: Reply) => unknown) => resolve({ error: null, ...reply });
    return builder;
  });
  const download = vi.fn(async () => ({ error: null, ...storage.download }));
  const remove = vi.fn(async () => ({ data: [], error: null, ...storage.remove }));
  const storageFrom = vi.fn(() => ({ download, remove }));
  const client = { from, storage: { from: storageFrom } } as unknown as Client;
  const stepsOn = (table: string, step: string) =>
    calls.filter(([t, s]) => t === table && s === step).map(([, , args]) => args);
  return { client, from, download, remove, storageFrom, calls, stepsOn, queues };
}

const pendingRow = (name: string) => ({
  data: {
    id: FILE,
    original_name: name,
    status: "pending",
    kind: null,
    pages: null,
    rejected_reason: null,
    storage_path: PATH,
  },
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("cleanFileName and uploadContentType", () => {
  it("keeps only the last path segment, without control or direction characters", () => {
    expect(cleanFileName("..\\..\\C:/notes/quiz\u202Efdp.docx")).toBe("quizfdp.docx");
    expect(cleanFileName("  week\u0000 3.pdf ")).toBe("week 3.pdf");
    expect(cleanFileName("a".repeat(300))).toHaveLength(255);
    expect(cleanFileName("folder/")).toBe("");
  });

  it("names the content type for an upload, and refuses .doc and .docm by name at once", () => {
    expect(uploadContentType("quiz.PDF")).toEqual({ ok: true, contentType: "application/pdf" });
    expect(uploadContentType("notes.md")).toEqual({ ok: true, contentType: "text/markdown" });
    expect(uploadContentType("notes.txt")).toEqual({ ok: true, contentType: "text/plain" });
    expect(uploadContentType("quiz.docx")).toMatchObject({
      contentType: expect.stringContaining("wordprocessingml"),
    });
    expect(uploadContentType("quiz.doc")).toMatchObject({ ok: false, code: "legacy_doc" });
    expect(uploadContentType("quiz.docm")).toMatchObject({ ok: false, code: "macro_enabled" });
    expect(uploadContentType("quiz.exe")).toMatchObject({ ok: false, code: "unsupported" });
    expect(uploadContentType("quiz")).toMatchObject({ ok: false, code: "unsupported" });
  });
});

describe("registerFile", () => {
  it("adds the row with the cleaned name and answers the path the database generated", async () => {
    const fake = fakeService({ ai_import_files: [{ data: { id: FILE, storage_path: PATH } }] });
    const result = await registerFile(
      fake.client,
      { orgId: ORG, batchId: BATCH },
      "C:\\Users\\x\\Week 3.pdf",
    );
    expect(result).toEqual({
      ok: true,
      fileId: FILE,
      storagePath: PATH,
      contentType: "application/pdf",
      name: "Week 3.pdf",
    });
    expect(fake.stepsOn("ai_import_files", "insert")).toEqual([
      [{ org_id: ORG, batch_id: BATCH, original_name: "Week 3.pdf" }],
    ]);
  });

  it("refuses a name it will not import without touching the database", async () => {
    const fake = fakeService({});
    expect(
      await registerFile(fake.client, { orgId: ORG, batchId: BATCH }, "old.doc"),
    ).toMatchObject({
      code: "legacy_doc",
    });
    expect(await registerFile(fake.client, { orgId: ORG, batchId: BATCH }, "\u0000")).toMatchObject(
      {
        code: "unsupported",
      },
    );
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("names the batch limits the database enforces", async () => {
    const full = fakeService({
      ai_import_files: [
        { data: null, error: { code: "23514", message: "a batch holds at most 5 files" } },
        {
          data: null,
          error: {
            code: "23514",
            message: "files are added to a batch only while it is uploading",
          },
        },
        { data: null, error: { code: "23503", message: "that batch does not exist" } },
        { data: null, error: { code: "XX000", message: "boom" } },
      ],
    });
    const ref = { orgId: ORG, batchId: BATCH };
    expect(await registerFile(full.client, ref, "a.pdf")).toMatchObject({ code: "batch_files" });
    expect(await registerFile(full.client, ref, "a.pdf")).toMatchObject({ code: "batch_closed" });
    expect(await registerFile(full.client, ref, "a.pdf")).toEqual({ ok: false, code: "not_found" });
    expect(await registerFile(full.client, ref, "a.pdf")).toEqual({
      ok: false,
      code: "unavailable",
    });
    // Only the code is logged, never the message (which can quote a row).
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("boom");
  });
});

describe("checkUploadedFile", () => {
  it("marks a good PDF ready with its hash and pages, and adds its chunks", async () => {
    const bytes = await buildPdf(20);
    const fake = fakeService(
      {
        ai_import_files: [pendingRow("quiz.pdf"), { data: [{ id: FILE }] }],
        ai_import_chunks: [{}],
      },
      { download: { data: new Blob([bytes as BlobPart]) } },
    );
    const result = await checkUploadedFile(fake.client, REF);
    expect(result).toEqual({
      ok: true,
      status: "ready",
      kind: "pdf",
      pages: 20,
      chunks: 3,
      images: 0,
    });
    expect(fake.storageFrom).toHaveBeenCalledWith(AI_IMPORT_BUCKET);
    expect(fake.download).toHaveBeenCalledWith(PATH);
    expect(fake.stepsOn("ai_import_chunks", "insert")[0][0]).toEqual([
      { file_id: FILE, batch_id: BATCH, org_id: ORG, position: 0, page_from: 1, page_to: 8 },
      { file_id: FILE, batch_id: BATCH, org_id: ORG, position: 1, page_from: 8, page_to: 15 },
      { file_id: FILE, batch_id: BATCH, org_id: ORG, position: 2, page_from: 15, page_to: 20 },
    ]);
    const [update] = fake.stepsOn("ai_import_files", "update");
    expect(update[0]).toMatchObject({
      status: "ready",
      kind: "pdf",
      pages: 20,
      size_bytes: bytes.length,
    });
    expect((update[0] as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
    // The row is looked up and updated within its workspace and batch, and only while pending.
    const filters = fake.stepsOn("ai_import_files", "eq");
    expect(filters).toContainEqual(["org_id", ORG]);
    expect(filters).toContainEqual(["batch_id", BATCH]);
    expect(filters).toContainEqual(["status", "pending"]);
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("refuses a .docm with its reason and deletes the object", async () => {
    const docm = buildDocx({ body: para("x"), mainType: DOCM_MAIN });
    const fake = fakeService(
      { ai_import_files: [pendingRow("quiz.docx"), { data: [{ id: FILE }] }] },
      { download: { data: new Blob([docm as BlobPart]) } },
    );
    expect(await checkUploadedFile(fake.client, REF)).toEqual({
      ok: true,
      status: "rejected",
      code: "macro_enabled",
      reason: REJECTIONS.macro_enabled,
    });
    expect(fake.stepsOn("ai_import_files", "update")[0][0]).toEqual({
      status: "rejected",
      rejected_reason: REJECTIONS.macro_enabled,
      size_bytes: docm.length,
    });
    expect(fake.remove).toHaveBeenCalledWith([PATH]);
  });

  it("refuses a file over 25 MB without reading it", async () => {
    const arrayBuffer = vi.fn();
    const fake = fakeService(
      { ai_import_files: [pendingRow("big.pdf"), { data: [{ id: FILE }] }] },
      { download: { data: { size: MAX_FILE_BYTES + 1, arrayBuffer } } },
    );
    expect(await checkUploadedFile(fake.client, REF)).toMatchObject({ code: "too_large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(fake.stepsOn("ai_import_files", "update")[0][0]).toMatchObject({ size_bytes: null });
  });

  it("answers a file checked already as it was decided, without downloading it", async () => {
    const fake = fakeService({
      ai_import_files: [
        { data: { ...pendingRow("a.pdf").data, status: "ready", kind: "pdf", pages: 9 } },
        {
          data: {
            ...pendingRow("a.doc").data,
            status: "rejected",
            rejected_reason: REJECTIONS.legacy_doc,
          },
        },
        { data: { ...pendingRow("a.txt").data, status: "rejected", rejected_reason: "old text" } },
      ],
      ai_import_chunks: [{ count: 2 }],
    });
    expect(await checkUploadedFile(fake.client, REF)).toEqual({
      ok: true,
      status: "ready",
      kind: "pdf",
      pages: 9,
      chunks: 2,
      images: null,
    });
    expect(await checkUploadedFile(fake.client, REF)).toMatchObject({
      status: "rejected",
      code: "legacy_doc",
    });
    expect(await checkUploadedFile(fake.client, REF)).toEqual({
      ok: true,
      status: "rejected",
      code: null,
      reason: "old text",
    });
    expect(fake.download).not.toHaveBeenCalled();
  });

  it("tells a missing row, a missing upload and an outage apart", async () => {
    expect(
      await checkUploadedFile(fakeService({ ai_import_files: [{ data: null }] }).client, REF),
    ).toEqual({ ok: false, code: "not_found" });
    expect(
      await checkUploadedFile(
        fakeService({ ai_import_files: [{ data: null, error: { code: "57014" } }] }).client,
        REF,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
    const missing = fakeService(
      { ai_import_files: [pendingRow("a.pdf")] },
      { download: { data: null, error: { status: 400, message: "Object not found" } } },
    );
    expect(await checkUploadedFile(missing.client, REF)).toEqual({
      ok: false,
      code: "not_uploaded",
    });
    const down = fakeService(
      { ai_import_files: [pendingRow("a.pdf")] },
      { download: { data: null, error: { status: 503, message: "down" } } },
    );
    expect(await checkUploadedFile(down.client, REF)).toEqual({ ok: false, code: "unavailable" });
  });

  it("refuses the same document twice in a batch, and a batch over 100 pages", async () => {
    const bytes = await buildPdf(2);
    for (const [code, expected] of [
      ["23505", "duplicate"],
      ["23514", "batch_pages"],
    ] as const) {
      const fake = fakeService(
        {
          ai_import_files: [
            pendingRow("a.pdf"),
            { data: null, error: { code } },
            { data: [{ id: FILE }] },
          ],
          ai_import_chunks: [{}, {}],
        },
        { download: { data: new Blob([bytes as BlobPart]) } },
      );
      expect(await checkUploadedFile(fake.client, REF)).toMatchObject({
        status: "rejected",
        code: expected,
      });
      expect(fake.stepsOn("ai_import_chunks", "delete")).toHaveLength(1);
      expect(fake.remove).toHaveBeenCalledWith([PATH]);
    }
  });

  it("leaves the file to a check already running", async () => {
    const bytes = await buildPdf(2);
    const racing = fakeService(
      { ai_import_files: [pendingRow("a.pdf")], ai_import_chunks: [{ error: { code: "23505" } }] },
      { download: { data: new Blob([bytes as BlobPart]) } },
    );
    expect(await checkUploadedFile(racing.client, REF)).toEqual({ ok: false, code: "in_progress" });

    const overtaken = fakeService(
      { ai_import_files: [pendingRow("a.pdf"), { data: [] }], ai_import_chunks: [{}, {}] },
      { download: { data: new Blob([bytes as BlobPart]) } },
    );
    expect(await checkUploadedFile(overtaken.client, REF)).toEqual({
      ok: false,
      code: "in_progress",
    });

    // A refusal that finds the file already decided deletes nothing.
    const decided = fakeService(
      { ai_import_files: [pendingRow("a.pdf"), { data: [] }] },
      { download: { data: new Blob([new Uint8Array([1, 2, 3])]) } },
    );
    expect(await checkUploadedFile(decided.client, REF)).toEqual({
      ok: false,
      code: "in_progress",
    });
    expect(decided.remove).not.toHaveBeenCalled();
  });

  it("answers unavailable when a write fails for another reason", async () => {
    const bytes = await buildPdf(2);
    const chunkFails = fakeService(
      { ai_import_files: [pendingRow("a.pdf")], ai_import_chunks: [{ error: { code: "XX000" } }] },
      { download: { data: new Blob([bytes as BlobPart]) } },
    );
    expect(await checkUploadedFile(chunkFails.client, REF)).toEqual({
      ok: false,
      code: "unavailable",
    });
    const updateFails = fakeService(
      {
        ai_import_files: [pendingRow("a.pdf"), { data: null, error: { code: "XX000" } }],
        ai_import_chunks: [{}, { error: { code: "XX000" } }],
      },
      { download: { data: new Blob([bytes as BlobPart]) } },
    );
    expect(await checkUploadedFile(updateFails.client, REF)).toEqual({
      ok: false,
      code: "unavailable",
    });
    const refuseFails = fakeService(
      { ai_import_files: [pendingRow("a.pdf"), { data: null, error: { code: "XX000" } }] },
      { download: { data: new Blob([new Uint8Array([1])]) } },
    );
    expect(await checkUploadedFile(refuseFails.client, REF)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});

describe("loadCheckedFile", () => {
  const readyRow = (sha256: string) => ({
    data: { original_name: "a.pdf", status: "ready", sha256, storage_path: PATH },
  });

  it("hands over the bytes and their chunks when they are the bytes that were checked", async () => {
    const bytes = await buildPdf(9);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const fake = fakeService(
      { ai_import_files: [readyRow(sha)] },
      { download: { data: new Blob([bytes as BlobPart]) } },
    );
    const loaded = await loadCheckedFile(fake.client, REF);
    expect(loaded).toMatchObject({ ok: true, prepared: { kind: "pdf", pages: 9, sha256: sha } });
    expect(loaded.ok && loaded.prepared.chunks).toHaveLength(2);
    expect(fake.stepsOn("ai_import_files", "eq")).toContainEqual(["org_id", ORG]);
  });

  it("refuses an object replaced since its check", async () => {
    const fake = fakeService(
      { ai_import_files: [readyRow("0".repeat(64))] },
      { download: { data: new Blob([(await buildPdf(2)) as BlobPart]) } },
    );
    expect(await loadCheckedFile(fake.client, REF)).toEqual({ ok: false, code: "changed" });
    const huge = fakeService(
      { ai_import_files: [readyRow("0".repeat(64))] },
      { download: { data: { size: MAX_FILE_BYTES + 1, arrayBuffer: vi.fn() } } },
    );
    expect(await loadCheckedFile(huge.client, REF)).toEqual({ ok: false, code: "changed" });
  });

  it("finds only a ready file, and answers an outage as unavailable", async () => {
    const pending = fakeService({ ai_import_files: [pendingRow("a.pdf")] });
    expect(await loadCheckedFile(pending.client, REF)).toEqual({ ok: false, code: "not_found" });
    expect(pending.download).not.toHaveBeenCalled();
    const down = fakeService({ ai_import_files: [{ data: null, error: { code: "57014" } }] });
    expect(await loadCheckedFile(down.client, REF)).toEqual({ ok: false, code: "unavailable" });
    const gone = fakeService(
      { ai_import_files: [readyRow("0".repeat(64))] },
      { download: { data: null, error: { status: 404 } } },
    );
    expect(await loadCheckedFile(gone.client, REF)).toEqual({ ok: false, code: "not_uploaded" });
  });
});

describe("removeFile", () => {
  it("deletes the object, then the row, while the batch is uploading", async () => {
    const fake = fakeService({
      ai_import_files: [pendingRow("a.pdf"), {}],
      ai_import_batches: [{ data: { status: "uploading" } }],
    });
    expect(await removeFile(fake.client, REF)).toEqual({ ok: true });
    expect(fake.remove).toHaveBeenCalledWith([PATH]);
    expect(fake.stepsOn("ai_import_files", "delete")).toHaveLength(1);
  });

  it("refuses once parsing has started, and stops if the object cannot be deleted", async () => {
    const closed = fakeService({
      ai_import_files: [pendingRow("a.pdf")],
      ai_import_batches: [{ data: { status: "parsing" } }],
    });
    expect(await removeFile(closed.client, REF)).toMatchObject({ code: "batch_closed" });
    expect(closed.remove).not.toHaveBeenCalled();

    const stuck = fakeService(
      {
        ai_import_files: [pendingRow("a.pdf")],
        ai_import_batches: [{ data: { status: "uploading" } }],
      },
      { remove: { data: null, error: { statusCode: "500" } } },
    );
    expect(await removeFile(stuck.client, REF)).toEqual({ ok: false, code: "unavailable" });
    expect(stuck.stepsOn("ai_import_files", "delete")).toHaveLength(0);
  });

  it("answers not found and unavailable", async () => {
    expect(
      await removeFile(fakeService({ ai_import_files: [{ data: null }] }).client, REF),
    ).toEqual({ ok: false, code: "not_found" });
    expect(
      await removeFile(
        fakeService({
          ai_import_files: [pendingRow("a.pdf")],
          ai_import_batches: [{ error: { code: "XX000" } }],
        }).client,
        REF,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
    expect(
      await removeFile(
        fakeService({
          ai_import_files: [pendingRow("a.pdf"), { error: { code: "XX000" } }],
          ai_import_batches: [{ data: { status: "uploading" } }],
        }).client,
        REF,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
  });
});
