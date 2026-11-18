import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMOVED_REASON } from "../files/reasons";
import { clearRemovedFiles, removeReadingFile } from "./removeFile";
import { BATCH, ORG, fakeClient, type Reply } from "./testing/fakeSupabase";

const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";
const F3 = "00000000-0000-4000-8000-0000000000f3";

const row = (id: string, status = "ready", reason: string | null = null) => ({
  id,
  status,
  rejected_reason: reason,
  storage_path: `${ORG}/${BATCH}/${id}`,
});

/** Three files in upload order; the second is the one a test removes. */
const threeFiles: Reply = { data: [row(F1), row(F2), row(F3)] };

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("removeReadingFile", () => {
  it("keeps the row as removed, and deletes its chunks, its own questions and its object", async () => {
    const service = fakeClient({
      ai_import_files: [threeFiles, {}],
      ai_import_chunks: [{}],
      ai_import_entries: [{}],
    });
    const ref = { orgId: ORG, batchId: BATCH, fileId: F2 };
    expect(await removeReadingFile(service.client, ref)).toEqual({ ok: true });

    // The row is marked, never deleted: the files after it keep their place.
    expect(service.stepsOn("ai_import_files", "delete")).toEqual([]);
    expect(service.stepsOn("ai_import_files", "update")).toEqual([
      [{ status: "rejected", rejected_reason: REMOVED_REASON }],
    ]);
    expect(service.stepsOn("ai_import_files", "eq")).toContainEqual(["id", F2]);
    expect(service.stepsOn("ai_import_chunks", "eq")).toContainEqual(["file_id", F2]);
    // Only the questions at the second file's place: 1000 up to, not including, 2000.
    expect(service.stepsOn("ai_import_entries", "gte")).toEqual([["position", 1000]]);
    expect(service.stepsOn("ai_import_entries", "lt")).toEqual([["position", 2000]]);
    expect(service.remove).toHaveBeenCalledWith([`${ORG}/${BATCH}/${F2}`]);
    // Every table is filtered by the workspace and the batch.
    for (const table of ["ai_import_files", "ai_import_chunks", "ai_import_entries"]) {
      expect(service.stepsOn(table, "eq")).toContainEqual(["org_id", ORG]);
      expect(service.stepsOn(table, "eq")).toContainEqual(["batch_id", BATCH]);
    }
  });

  it("counts a file removed earlier when it works out a later file's place", async () => {
    const service = fakeClient({
      ai_import_files: [{ data: [row(F1), row(F2, "rejected", REMOVED_REASON), row(F3)] }, {}],
      ai_import_chunks: [{}],
      ai_import_entries: [{}],
    });
    await removeReadingFile(service.client, { orgId: ORG, batchId: BATCH, fileId: F3 });
    expect(service.stepsOn("ai_import_entries", "gte")).toEqual([["position", 2000]]);
    expect(service.stepsOn("ai_import_entries", "lt")).toEqual([["position", 3000]]);
  });

  it("does not find a file that is not in this workspace's batch, and changes nothing", async () => {
    const service = fakeClient({ ai_import_files: [{ data: [row(F1)] }] });
    expect(
      await removeReadingFile(service.client, { orgId: ORG, batchId: BATCH, fileId: F2 }),
    ).toEqual({ ok: false, code: "not_found" });
    expect(service.stepsOn("ai_import_files", "update")).toEqual([]);
    expect(service.remove).not.toHaveBeenCalled();
  });

  it("answers unavailable when a step fails, and can be run again", async () => {
    const ref = { orgId: ORG, batchId: BATCH, fileId: F2 };
    const unread = fakeClient({ ai_import_files: [{ error: { code: "XX000" } }] });
    expect(await removeReadingFile(unread.client, ref)).toEqual({ ok: false, code: "unavailable" });

    const unmarked = fakeClient({ ai_import_files: [threeFiles, { error: { code: "XX000" } }] });
    expect(await removeReadingFile(unmarked.client, ref)).toEqual({
      ok: false,
      code: "unavailable",
    });

    const halfway = fakeClient({
      ai_import_files: [threeFiles, {}],
      ai_import_chunks: [{}],
      ai_import_entries: [{ error: { code: "XX000" } }],
    });
    expect(await removeReadingFile(halfway.client, ref)).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(halfway.remove).not.toHaveBeenCalled();

    // The second run finds the file already marked and clears it the same way.
    const again = fakeClient({
      ai_import_files: [{ data: [row(F1), row(F2, "rejected", REMOVED_REASON), row(F3)] }, {}],
      ai_import_chunks: [{}],
      ai_import_entries: [{}],
    });
    expect(await removeReadingFile(again.client, ref)).toEqual({ ok: true });
  });

  it("still removes the file when its object cannot be deleted", async () => {
    const service = fakeClient(
      { ai_import_files: [threeFiles, {}], ai_import_chunks: [{}], ai_import_entries: [{}] },
      { remove: { data: null, error: { code: "500" } } },
    );
    expect(
      await removeReadingFile(service.client, { orgId: ORG, batchId: BATCH, fileId: F2 }),
    ).toEqual({ ok: true });
  });
});

describe("clearRemovedFiles", () => {
  it("clears each removed file's place again and counts the files that are left", async () => {
    const service = fakeClient({
      ai_import_files: [
        {
          data: [
            row(F1),
            row(F2, "rejected", REMOVED_REASON),
            // Refused when it was checked: it never had chunks or questions, so it is left alone.
            row(F3, "rejected", "The file is empty."),
          ],
        },
      ],
      ai_import_chunks: [{}],
      ai_import_entries: [{}],
    });
    expect(await clearRemovedFiles(service.client, { orgId: ORG, batchId: BATCH })).toEqual({
      ok: true,
      ready: 1,
      // The places a reader must leave out: the removed file's, not the refused one's.
      removed: new Set([1]),
    });
    expect(service.stepsOn("ai_import_chunks", "eq")).toContainEqual(["file_id", F2]);
    expect(service.stepsOn("ai_import_entries", "gte")).toEqual([["position", 1000]]);
    expect(service.left()).toEqual([]);
  });

  it("touches nothing when no file was removed, and answers unavailable on an error", async () => {
    const none = fakeClient({ ai_import_files: [threeFiles] });
    expect(await clearRemovedFiles(none.client, { orgId: ORG, batchId: BATCH })).toEqual({
      ok: true,
      ready: 3,
      removed: new Set(),
    });
    const broken = fakeClient({
      ai_import_files: [{ data: [row(F1, "rejected", REMOVED_REASON)] }],
      ai_import_chunks: [{ error: { code: "XX000" } }],
      ai_import_entries: [{}],
    });
    expect(await clearRemovedFiles(broken.client, { orgId: ORG, batchId: BATCH })).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
