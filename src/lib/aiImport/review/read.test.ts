import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BANK, BATCH, ORG, fakeClient } from "../upload/testing/fakeSupabase";
import { readReviewBatch, toEntryView, type EntryRow } from "./read";

const row = (over: Partial<EntryRow> = {}): EntryRow => ({
  id: "e1",
  version: 2,
  position: 1003,
  kind: "item",
  type: "bowtie",
  status: "needs_fix",
  reasons: ["unmarked_key: Check the key."],
  source_excerpt: "A client...",
  item: null,
  group_key: null,
  step: null,
  ...over,
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("toEntryView", () => {
  it("reads a row's reasons, type and group, and never its draft", () => {
    const view = toEntryView({
      ...row({ group_key: "Ectopic", step: 2 }),
      draft: { secret: 1 },
    } as EntryRow);
    expect(view).toEqual({
      id: "e1",
      version: 2,
      position: 1003,
      kind: "item",
      type: "bowtie",
      status: "needs_fix",
      reasons: [{ code: "unmarked_key", message: "Check the key." }],
      sourceExcerpt: "A client...",
      item: null,
      group: { title: "Ectopic", step: 2 },
    });
    expect(JSON.stringify(view)).not.toContain("secret");
  });

  it("reads a case study, an unknown type and an unknown status safely", () => {
    expect(toEntryView(row({ kind: "case_study", type: "matching", status: "odd" }))).toMatchObject(
      {
        kind: "case_study",
        type: null,
        status: "needs_fix",
      },
    );
  });
});

describe("readReviewBatch", () => {
  it("reads the batch of this workspace and quiz, its files in order and its entries", async () => {
    const client = fakeClient({
      ai_import_batches: [{ data: { id: BATCH, status: "review", bank_id: BANK } }],
      ai_import_files: [{ data: [{ original_name: "one.md" }, { original_name: "two.pdf" }] }],
      ai_import_entries: [{ data: [row()] }],
    });
    const batch = await readReviewBatch(client.client, ORG, BATCH, BANK);
    expect(batch).toMatchObject({
      id: BATCH,
      status: "review",
      bankId: BANK,
      fileNames: ["one.md", "two.pdf"],
      entries: [{ id: "e1" }],
    });
    for (const table of ["ai_import_batches", "ai_import_files", "ai_import_entries"]) {
      expect(client.stepsOn(table, "eq")).toContainEqual(["org_id", ORG]);
    }
    expect(client.stepsOn("ai_import_batches", "eq")).toContainEqual(["bank_id", BANK]);
    // The draft is never selected.
    expect(String(client.stepsOn("ai_import_entries", "select")[0]?.[0])).not.toContain("draft");
  });

  it("is null for a batch it cannot see, and unavailable when a read fails", async () => {
    const none = fakeClient({
      ai_import_batches: [{ data: null }],
      ai_import_files: [{ data: [] }],
      ai_import_entries: [{ data: [] }],
    });
    expect(await readReviewBatch(none.client, ORG, BATCH, BANK)).toBeNull();
    const broken = fakeClient({
      ai_import_batches: [{ data: null }],
      ai_import_files: [{ error: { code: "XX000" } }],
      ai_import_entries: [{ data: [] }],
    });
    expect(await readReviewBatch(broken.client, ORG, BATCH, BANK)).toBe("unavailable");
  });
});
