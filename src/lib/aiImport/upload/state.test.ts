import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openBatchId, readAllowance, readBatchView } from "./state";
import { BANK, BATCH, ORG, fakeClient } from "./testing/fakeSupabase";

const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("readBatchView", () => {
  it("lists files in upload order with their chunks and the questions staged from each", async () => {
    const service = fakeClient({
      ai_import_batches: [{ data: { id: BATCH, status: "parsing" } }],
      ai_import_files: [
        {
          data: [
            { id: F1, original_name: "one.md", status: "ready", rejected_reason: null, pages: 2 },
            {
              id: F2,
              original_name: "two.doc",
              status: "rejected",
              rejected_reason: "Old Word file.",
              pages: null,
            },
          ],
        },
      ],
      ai_import_chunks: [
        {
          data: [
            { file_id: F1, position: 0, status: "done" },
            { file_id: F1, position: 1, status: "pending" },
          ],
        },
      ],
      ai_import_entries: [{ data: [{ position: 0 }, { position: 3 }, { position: 1001 }] }],
    });
    const view = await readBatchView(service.client, ORG, BATCH, BANK);
    expect(view).toEqual({
      id: BATCH,
      status: "parsing",
      files: [
        {
          id: F1,
          name: "one.md",
          status: "ready",
          reason: null,
          pages: 2,
          chunks: [
            { position: 0, status: "done" },
            { position: 1, status: "pending" },
          ],
          questions: 2,
        },
        {
          id: F2,
          name: "two.doc",
          status: "rejected",
          reason: "Old Word file.",
          pages: null,
          chunks: [],
          questions: 1,
        },
      ],
    });
    // Every read is filtered by the workspace; the batch also by its quiz.
    for (const table of ["ai_import_batches", "ai_import_files", "ai_import_chunks"]) {
      expect(service.stepsOn(table, "eq")).toContainEqual(["org_id", ORG]);
    }
    expect(service.stepsOn("ai_import_batches", "eq")).toContainEqual(["bank_id", BANK]);
  });

  it("answers null for a batch it cannot find, and unavailable on an error", async () => {
    const empty = { ai_import_files: [{ data: [] }], ai_import_chunks: [{ data: [] }] };
    const missing = fakeClient({
      ai_import_batches: [{ data: null }],
      ai_import_entries: [{ data: [] }],
      ...empty,
    });
    expect(await readBatchView(missing.client, ORG, BATCH)).toBeNull();
    const broken = fakeClient({
      ai_import_batches: [{ data: null }],
      ai_import_entries: [{ error: { code: "X" } }],
      ...empty,
    });
    expect(await readBatchView(broken.client, ORG, BATCH)).toBe("unavailable");
  });
});

describe("openBatchId", () => {
  it("finds the newest batch of this quiz still uploading or reading", async () => {
    const service = fakeClient({ ai_import_batches: [{ data: [{ id: BATCH }] }] });
    expect(await openBatchId(service.client, ORG, BANK)).toBe(BATCH);
    expect(service.stepsOn("ai_import_batches", "in")).toEqual([
      ["status", ["uploading", "parsing"]],
    ]);
    const none = fakeClient({ ai_import_batches: [{ data: [] }] });
    expect(await openBatchId(none.client, ORG, BANK)).toBeNull();
    const broken = fakeClient({ ai_import_batches: [{ error: { code: "X" } }] });
    expect(await openBatchId(broken.client, ORG, BANK)).toBe("unavailable");
  });
});

describe("readAllowance", () => {
  it("subtracts what is used and reserved this month from the cap", async () => {
    const service = fakeClient({
      orgs: [{ data: { ai_import_monthly_cap_usd: "10.00", ai_import_monthly_page_cap: 300 } }],
      ai_usage: [
        {
          data: {
            cost_used_usd: "2.5",
            cost_reserved_usd: "0.5",
            pages_used: 20,
            pages_reserved: 5,
          },
        },
      ],
    });
    const now = new Date("2026-10-15T12:00:00Z");
    expect(await readAllowance(service.client, ORG, now)).toEqual({
      remainingUsd: 7,
      remainingPages: 275,
    });
    expect(service.stepsOn("ai_usage", "eq")).toContainEqual(["month", "2026-10-01"]);
  });

  it("is the whole cap in a month with no usage, and unavailable on an error", async () => {
    const fresh = fakeClient({
      orgs: [{ data: { ai_import_monthly_cap_usd: 10, ai_import_monthly_page_cap: null } }],
      ai_usage: [{ data: null }],
    });
    expect(await readAllowance(fresh.client, ORG)).toEqual({
      remainingUsd: 10,
      remainingPages: null,
    });
    const broken = fakeClient({ orgs: [{ error: { code: "X" } }], ai_usage: [{ data: null }] });
    expect(await readAllowance(broken.client, ORG)).toBe("unavailable");
  });
});
