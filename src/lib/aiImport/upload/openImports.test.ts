import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMOVED_REASON } from "../files/reasons";
import { readOpenImports } from "./openImports";
import { BANK, BATCH, ORG, fakeClient } from "./testing/fakeSupabase";

const B2 = "00000000-0000-4000-8000-0000000000b2";
const B3 = "00000000-0000-4000-8000-0000000000b3";

const ready = (batch: string) => ({ batch_id: batch, status: "ready", rejected_reason: null });
const removed = (batch: string) => ({
  batch_id: batch,
  status: "rejected",
  rejected_reason: REMOVED_REASON,
});
const at = (batch: string, ...positions: number[]) =>
  positions.map((position) => ({ batch_id: batch, position }));

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("readOpenImports", () => {
  it("lists the quiz's unfinished imports, and counts questions for those in review only", async () => {
    const client = fakeClient({
      ai_import_batches: [
        {
          data: [
            { id: BATCH, status: "review" },
            { id: B2, status: "parsing" },
            { id: B3, status: "review" },
          ],
        },
      ],
      ai_import_files: [{ data: [ready(BATCH), ready(B3), ready(BATCH)] }],
      ai_import_entries: [{ data: [...at(BATCH, 0, 1, 1000), ...at(B3, 4)] }],
    });
    expect(await readOpenImports(client.client, ORG, BANK)).toEqual([
      { id: BATCH, status: "review", questions: 3 },
      { id: B2, status: "parsing", questions: 0 },
      { id: B3, status: "review", questions: 1 },
    ]);
    expect(client.stepsOn("ai_import_batches", "in")).toEqual([
      ["status", ["uploading", "parsing", "review"]],
    ]);
    // The workspace comes from the session and the quiz from the page: both filter the read.
    expect(client.stepsOn("ai_import_batches", "eq")).toEqual([
      ["org_id", ORG],
      ["bank_id", BANK],
    ]);
    // One read of files and one of entries for every batch in review, and none for the rest.
    expect(client.from).toHaveBeenCalledTimes(3);
    for (const table of ["ai_import_files", "ai_import_entries"]) {
      expect(client.stepsOn(table, "in")).toEqual([["batch_id", [BATCH, B3]]]);
      expect(client.stepsOn(table, "eq")).toEqual([["org_id", ORG]]);
    }
    // Positions are asked for, never a question.
    expect(client.stepsOn("ai_import_entries", "select")).toEqual([["batch_id, position"]]);
  });

  it("does not count a question staged at a removed file's place", async () => {
    const client = fakeClient({
      ai_import_batches: [{ data: [{ id: BATCH, status: "review" }] }],
      // The first file was removed; a request still reading it staged a question afterwards.
      ai_import_files: [{ data: [removed(BATCH), ready(BATCH)] }],
      ai_import_entries: [{ data: at(BATCH, 7, 1000, 1001) }],
    });
    expect(await readOpenImports(client.client, ORG, BANK)).toEqual([
      { id: BATCH, status: "review", questions: 2 },
    ]);
  });

  it("makes one read when no import is in review", async () => {
    const client = fakeClient({ ai_import_batches: [{ data: [{ id: B2, status: "uploading" }] }] });
    expect(await readOpenImports(client.client, ORG, BANK)).toEqual([
      { id: B2, status: "uploading", questions: 0 },
    ]);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("reads as none when the list cannot be read, and as no questions when a count fails", async () => {
    const broken = fakeClient({ ai_import_batches: [{ error: { code: "X" } }] });
    expect(await readOpenImports(broken.client, ORG, BANK)).toEqual([]);
    const uncounted = fakeClient({
      ai_import_batches: [{ data: [{ id: BATCH, status: "review" }] }],
      ai_import_files: [{ data: [] }],
      ai_import_entries: [{ error: { code: "X" } }],
    });
    expect(await readOpenImports(uncounted.client, ORG, BANK)).toEqual([
      { id: BATCH, status: "review", questions: 0 },
    ]);
  });
});
