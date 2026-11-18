import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMOVED_REASON } from "../files/reasons";
import { BANK, BATCH, ORG, fakeClient } from "../upload/testing/fakeSupabase";
import {
  LIST_SOURCE_LIMIT,
  answersOf,
  chunkPages,
  listSource,
  readReviewBatch,
  toEntryView,
  type EntryRow,
} from "./read";

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
      sourcePages: null,
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
      ai_import_chunks: [{ data: [] }],
    });
    const batch = await readReviewBatch(client.client, ORG, BATCH, BANK);
    expect(batch).toMatchObject({
      id: BATCH,
      status: "review",
      bankId: BANK,
      fileNames: ["one.md", "two.pdf"],
      entries: [{ id: "e1" }],
      answers: { unmatched: 0, dropped: 0 },
    });
    for (const table of ["ai_import_batches", "ai_import_files", "ai_import_entries"]) {
      expect(client.stepsOn(table, "eq")).toContainEqual(["org_id", ORG]);
    }
    expect(client.stepsOn("ai_import_batches", "eq")).toContainEqual(["bank_id", BANK]);
    // The draft is never selected.
    expect(String(client.stepsOn("ai_import_entries", "select")[0]?.[0])).not.toContain("draft");
  });

  // #592: the counts `finishExtraction` wrote beside the batch's source matter.
  it("reads how many answers reached no question", async () => {
    const client = fakeClient({
      ai_import_batches: [
        {
          data: {
            id: BATCH,
            status: "review",
            bank_id: BANK,
            source: { objectives: [], references: [], unmatchedAnswers: 3, droppedAnswers: 1 },
          },
        },
      ],
      ai_import_files: [{ data: [{ original_name: "one.docx" }] }],
      ai_import_entries: [{ data: [row()] }],
      ai_import_chunks: [{ data: [] }],
    });
    const batch = await readReviewBatch(client.client, ORG, BATCH, BANK);
    expect(batch).toMatchObject({ answers: { unmatched: 3, dropped: 1 } });
    expect(String(client.stepsOn("ai_import_batches", "select")[0]?.[0])).toContain("source");
  });

  it("reads no count from a batch finished before #592, or from anything that is not one", () => {
    expect(answersOf(null)).toEqual({ unmatched: 0, dropped: 0 });
    expect(answersOf({ objectives: [], references: [] })).toEqual({ unmatched: 0, dropped: 0 });
    expect(answersOf({ unmatchedAnswers: "3", droppedAnswers: -2 })).toEqual({
      unmatched: 0,
      dropped: 0,
    });
    expect(answersOf({ unmatchedAnswers: 2.5, droppedAnswers: 4 })).toEqual({
      unmatched: 0,
      dropped: 4,
    });
    expect(answersOf("text")).toEqual({ unmatched: 0, dropped: 0 });
  });

  // #591: a request still reading a removed file can stage a question after every delete.
  it("does not show an entry that landed at a removed file's place", async () => {
    const client = fakeClient({
      ai_import_batches: [{ data: { id: BATCH, status: "review", bank_id: BANK } }],
      ai_import_files: [
        {
          data: [
            { original_name: "removed.md", status: "rejected", rejected_reason: REMOVED_REASON },
            { original_name: "kept.md", status: "ready", rejected_reason: null },
          ],
        },
      ],
      ai_import_entries: [
        { data: [row({ id: "stray", position: 4 }), row({ id: "kept", position: 1003 })] },
      ],
      ai_import_chunks: [{ data: [] }],
    });
    const batch = await readReviewBatch(client.client, ORG, BATCH, BANK);
    expect(batch).toMatchObject({
      // The removed file keeps its name here, so the kept file is still the second.
      fileNames: ["removed.md", "kept.md"],
      entries: [{ id: "kept", position: 1003 }],
    });
  });

  it("is null for a batch it cannot see, and unavailable when a read fails", async () => {
    const none = fakeClient({
      ai_import_batches: [{ data: null }],
      ai_import_files: [{ data: [] }],
      ai_import_entries: [{ data: [] }],
      ai_import_chunks: [{ data: [] }],
    });
    expect(await readReviewBatch(none.client, ORG, BATCH, BANK)).toBeNull();
    const broken = fakeClient({
      ai_import_batches: [{ data: null }],
      ai_import_files: [{ error: { code: "XX000" } }],
      ai_import_entries: [{ data: [] }],
      ai_import_chunks: [{ data: [] }],
    });
    expect(await readReviewBatch(broken.client, ORG, BATCH, BANK)).toBe("unavailable");
  });
});

describe("how much source the review list sends (#593 review)", () => {
  const long = Array.from({ length: 400 }, (_, n) => `Line ${n} of a long question.`).join("\n");

  it("sends a short source whole, and says nothing was cut", () => {
    expect(listSource("Which food first?\nA. Tea\nB. Yogurt *", 4_000)).toEqual({
      text: "Which food first?\nA. Tea\nB. Yogurt *",
      cut: false,
    });
  });

  it("cuts a long one on a whole line, and on a whole character", () => {
    const cut = listSource(long, LIST_SOURCE_LIMIT);
    expect(cut.cut).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(LIST_SOURCE_LIMIT);
    expect(cut.text.endsWith("of a long question.")).toBe(true);
    // No line break near the limit: cut where it falls, never inside a character.
    const faces = listSource("😀".repeat(5_000), 4_001);
    expect(faces.cut).toBe(true);
    expect(() => encodeURIComponent(faces.text)).not.toThrow();
  });

  it("caps a question's source on the list and tells the page; a case study is sent whole", async () => {
    const client = fakeClient({
      ai_import_batches: [{ data: { id: BATCH, status: "review", bank_id: BANK } }],
      ai_import_files: [{ data: [{ original_name: "one.md" }] }],
      ai_import_entries: [
        {
          data: [
            row({ id: "long", source_excerpt: long }),
            row({ id: "short", position: 1004 }),
            row({
              id: "case",
              position: 1005,
              kind: "case_study",
              type: null,
              source_excerpt: long,
            }),
          ],
        },
      ],
      ai_import_chunks: [{ data: [] }],
    });
    const batch = await readReviewBatch(client.client, ORG, BATCH, BANK);
    if (!batch || batch === "unavailable") throw new Error("no batch");
    const [first, second, third] = batch.entries;
    expect(first!.sourceExcerpt.length).toBeLessThanOrEqual(LIST_SOURCE_LIMIT);
    expect(first!.sourceCut).toBe(true);
    expect(second).not.toHaveProperty("sourceCut");
    // Six questions' worth, with no edit page of its own to show the rest on.
    expect(third!.sourceExcerpt).toBe(long);
    // Elsewhere (the edit page) the same row is read whole.
    expect(toEntryView(row({ source_excerpt: long }) as EntryRow).sourceExcerpt).toBe(long);
  });

  it("reads each PDF chunk's pages once for the batch, and gives each entry its own", async () => {
    const client = fakeClient({
      ai_import_batches: [{ data: { id: BATCH, status: "review", bank_id: BANK } }],
      ai_import_files: [{ data: [{ original_name: "one.pdf" }] }],
      ai_import_entries: [
        {
          data: [
            row({ id: "a", chunk_id: "c1" }),
            row({ id: "b", position: 1004, chunk_id: "c2" }),
          ],
        },
      ],
      ai_import_chunks: [
        {
          data: [
            { id: "c1", page_from: 1, page_to: 8 },
            { id: "c2", page_from: null, page_to: null },
          ],
        },
      ],
    });
    const batch = await readReviewBatch(client.client, ORG, BATCH, BANK);
    if (!batch || batch === "unavailable") throw new Error("no batch");
    expect(batch.entries.map((entry) => entry.sourcePages)).toEqual([{ from: 1, to: 8 }, null]);
    expect(chunkPages([{ id: "c1", page_from: 1, page_to: 8 }]).get("c1")).toEqual({
      from: 1,
      to: 8,
    });
  });
});
