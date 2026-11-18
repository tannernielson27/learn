import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOpenImports } from "./openImports";
import { BANK, BATCH, ORG, fakeClient } from "./testing/fakeSupabase";

const B2 = "00000000-0000-4000-8000-0000000000b2";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("readOpenImports", () => {
  it("lists the quiz's unfinished imports, review included, with the questions found", async () => {
    const client = fakeClient({
      ai_import_batches: [
        {
          data: [
            { id: BATCH, status: "review" },
            { id: B2, status: "parsing" },
          ],
        },
      ],
      ai_import_entries: [{ count: 12 }, { count: 0 }],
    });
    expect(await readOpenImports(client.client, ORG, BANK)).toEqual([
      { id: BATCH, status: "review", questions: 12 },
      { id: B2, status: "parsing", questions: 0 },
    ]);
    expect(client.stepsOn("ai_import_batches", "in")).toEqual([
      ["status", ["uploading", "parsing", "review"]],
    ]);
    // The workspace comes from the session and the quiz from the page: both filter the read.
    expect(client.stepsOn("ai_import_batches", "eq")).toEqual([
      ["org_id", ORG],
      ["bank_id", BANK],
    ]);
    expect(client.stepsOn("ai_import_entries", "eq")).toContainEqual(["org_id", ORG]);
    // A count is asked for, never a question.
    expect(client.stepsOn("ai_import_entries", "select")).toEqual([
      ["id", { count: "exact", head: true }],
      ["id", { count: "exact", head: true }],
    ]);
  });

  it("reads as none when the list cannot be read, and as no questions when a count fails", async () => {
    const broken = fakeClient({ ai_import_batches: [{ error: { code: "X" } }] });
    expect(await readOpenImports(broken.client, ORG, BANK)).toEqual([]);
    const uncounted = fakeClient({
      ai_import_batches: [{ data: [{ id: BATCH, status: "review" }] }],
      ai_import_entries: [{ error: { code: "X" } }],
    });
    expect(await readOpenImports(uncounted.client, ORG, BANK)).toEqual([
      { id: BATCH, status: "review", questions: 0 },
    ]);
  });
});
