import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchDuplicateReasons,
  duplicateReasons,
  entryStem,
  markDuplicates,
  refreshBatchDuplicates,
  stemHash,
  type EntryForDuplicates,
} from "./duplicates";
import { REMOVED_REASON } from "./files/reasons";
import { fakeClient, type Reply } from "./upload/testing/fakeSupabase";
import { extractQuestions, regionsOf } from "./extractQuestions";
import { POSITIONS_PER_FILE, rowOf } from "./extractUnit";
import { mergeSegments } from "./merge";
import { readSegment } from "./segment";
import { COURSE_ACTIVITY, activityExtraction, activitySegment } from "./testing/extractRecordings";

afterEach(() => vi.restoreAllMocks());

describe("stemHash", () => {
  it("ignores case, markup, punctuation and spacing, and not the words", () => {
    expect(stemHash("Which food should the nurse **suggest** first?")).toBe(
      stemHash("which food should the nurse suggest first"),
    );
    expect(stemHash("Which food first?")).not.toBe(stemHash("Which drink first?"));
    expect(stemHash(" ** ")).toBeNull();
  });
});

describe("duplicateReasons", () => {
  /** The course activity staged as two files of one batch: the PDF first, then the .docx. */
  async function stagedTwice() {
    const chunk = { position: 0, of: 1, pageFrom: null, pageTo: null };
    const fromPdf = mergeSegments([
      readSegment(
        activitySegment,
        { ...chunk, pageFrom: 1, pageTo: 2 },
        {
          type: "pdf",
          bytes: new Uint8Array(),
        },
      ),
    ]).questions;
    const fromDocx = mergeSegments([
      readSegment(activitySegment, chunk, { type: "text", text: COURSE_ACTIVITY }),
    ]).questions;
    const call = async () => ({
      value: activityExtraction,
      usage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
      attempts: 1,
    });
    const pdf = await extractQuestions(
      call,
      fromPdf,
      { payload: { type: "pdf", bytes: new Uint8Array() }, kind: "pdf", sourceText: null },
      new Map(),
    );
    const docx = await extractQuestions(
      call,
      fromDocx,
      {
        payload: { type: "text", text: COURSE_ACTIVITY },
        kind: "docx",
        sourceText: COURSE_ACTIVITY,
      },
      regionsOf(fromDocx, COURSE_ACTIVITY),
    );
    return [
      ...pdf.map((entry) => rowOf(entry, 0, new Map())),
      ...docx.map((entry) => rowOf(entry, POSITIONS_PER_FILE, new Map())),
    ].map((row, index): EntryForDuplicates => ({
      id: `entry-${index}`,
      position: row.position,
      stem: entryStem(row),
      reasons: row.reasons,
    }));
  }

  it("flags the same question in the .pdf and the .docx of one document, keeping the first", async () => {
    const entries = await stagedTwice();
    expect(entries).toHaveLength(8);
    const changes = duplicateReasons(entries, []);
    expect([...changes.keys()]).toEqual(["entry-4", "entry-5", "entry-6", "entry-7"]);
    for (const reasons of changes.values()) {
      expect(reasons.at(-1)).toBe(
        "duplicate: The same question is earlier in this import. Keep one of them.",
      );
    }
  });

  it("flags a question already in the workspace, and is the same the second time it runs", async () => {
    const entries = await stagedTwice();
    const stems = [
      "Which food should the nurse suggest first to increase Mr. Ortega's protein intake?",
    ];
    const changes = duplicateReasons(entries, stems);
    expect(changes.get("entry-1")?.at(-1)).toBe(
      "duplicate: This question is already in one of your workspace's quizzes.",
    );
    const again = entries.map((entry) => ({
      ...entry,
      reasons: changes.get(entry.id) ?? entry.reasons,
    }));
    expect(duplicateReasons(again, stems).size).toBe(0);
  });

  it("takes a flag away when the copy is gone", () => {
    const changes = duplicateReasons(
      [{ id: "a", position: 0, stem: "Alone", reasons: ["duplicate: old", "warning: keep"] }],
      [],
    );
    expect(changes.get("a")).toEqual(["warning: keep"]);
  });
});

describe("entryStem", () => {
  it("reads the item's stem, else the draft's, else the opening words", () => {
    expect(
      entryStem({ item: { stem: { value: "I" } }, draft: { stem: "D" }, source_excerpt: "E" }),
    ).toBe("I");
    expect(entryStem({ item: null, draft: { stem: "D" }, source_excerpt: "E" })).toBe("D");
    expect(entryStem({ item: null, draft: "x", source_excerpt: "E" })).toBe("e");
    // #593: a case study keeps its first step's opening on its draft, and a question's whole part
    // of a document begins with the words its PDF copy's opening has.
    expect(
      entryStem({ item: null, draft: { opening: "A client, 29." }, source_excerpt: "Whole part" }),
    ).toBe("a client 29");
    const opening = "Discuss with a partner how you would teach this client about the diet";
    expect(
      entryStem({ item: null, draft: null, source_excerpt: `**${opening}** and why.\n- A\n- B` }),
    ).toBe(entryStem({ item: null, draft: null, source_excerpt: opening }));
  });
});

/** A service client that answers the two reads and records the updates. */
function fakeService(
  options: { entriesError?: boolean; itemsError?: boolean; updateError?: boolean } = {},
) {
  const updates: { reasons: string[]; id: string }[] = [];
  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pending: { reasons: string[] } | null = null;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      limit: () => builder,
      update: (values: { reasons: string[] }) => {
        pending = values;
        return builder;
      },
      then: (resolve: (value: unknown) => void) => {
        if (pending) {
          updates.push({ ...pending, id: filters.id as string });
          return resolve({ error: options.updateError ? { code: "x" } : null });
        }
        if (table === "items") {
          return resolve(
            options.itemsError
              ? { data: null, error: { code: "x" } }
              : { data: [{ stem: "Seen before?" }, { stem: null }], error: null },
          );
        }
        return resolve(
          options.entriesError
            ? { data: null, error: { code: "x" } }
            : {
                data: [
                  {
                    id: "e1",
                    position: 0,
                    item: null,
                    draft: null,
                    source_excerpt: "Seen before?",
                    reasons: [],
                    status: "needs_answer",
                  },
                  {
                    id: "e2",
                    position: 1,
                    item: null,
                    draft: null,
                    source_excerpt: "Seen before?",
                    reasons: [],
                    status: "dropped",
                  },
                ],
                error: null,
              },
        );
      },
    };
    return builder;
  };
  return { service: { from: query } as unknown as Parameters<typeof markDuplicates>[0], updates };
}

describe("markDuplicates", () => {
  const ref = { orgId: "org-1", batchId: "batch-1" };

  it("writes the reasons that change, skipping dropped entries", async () => {
    const { service, updates } = fakeService();
    expect(await markDuplicates(service, ref)).toEqual({ ok: true, changed: 1 });
    expect(updates).toEqual([
      {
        id: "e1",
        reasons: ["duplicate: This question is already in one of your workspace's quizzes."],
      },
    ]);
  });

  // #591: both entries sit at the first file's place; with that file removed, neither counts.
  it("leaves out entries at a removed file's place", async () => {
    const { service, updates } = fakeService();
    expect(await markDuplicates(service, ref, new Set([0]))).toEqual({ ok: true, changed: 0 });
    expect(updates).toEqual([]);
  });

  it("answers unavailable when a read or a write fails, logging only a code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const options of [{ entriesError: true }, { itemsError: true }, { updateError: true }]) {
      expect(await markDuplicates(fakeService(options).service, ref)).toEqual({
        ok: false,
        code: "unavailable",
      });
    }
    expect(JSON.stringify(error.mock.calls)).not.toContain("Seen before");
  });
});

describe("batchDuplicateReasons (#593)", () => {
  const IN_BATCH = "duplicate: The same question is earlier in this import. Keep one of them.";
  const IN_WORKSPACE = "duplicate: This question is already in one of your workspace's quizzes.";
  const copy = (id: string, position: number, stem: string | null, reasons: string[] = []) => ({
    id,
    position,
    stem,
    reasons,
  });

  it("clears the later copy's flag once the earlier copy is no longer kept", () => {
    // The caller hands in kept entries only: the earlier copy was dropped.
    const changes = batchDuplicateReasons([copy("later", 5, "Which food first?", [IN_BATCH])]);
    expect(changes).toEqual(new Map([["later", []]]));
  });

  it("flags a question whose edited stem now matches an earlier one, and only that one", () => {
    const changes = batchDuplicateReasons([
      copy("first", 0, "Which food first?", ["warning: keep"]),
      copy("edited", 3, "Which **food** first?", ["warning: keep"]),
      copy("other", 4, "Which drink first?"),
    ]);
    expect(changes).toEqual(new Map([["edited", ["warning: keep", IN_BATCH]]]));
  });

  it("leaves the workspace's flag, and an entry with no stem, exactly as they are", () => {
    const changes = batchDuplicateReasons([
      copy("known", 0, "Which food first?", [IN_WORKSPACE]),
      copy("again", 1, "Which food first?", [IN_WORKSPACE, IN_BATCH]),
      copy("open", 2, null, [IN_BATCH]),
      copy("blank", 3, " ** ", [IN_BATCH]),
    ]);
    expect(changes.size).toBe(0);
  });
});

describe("refreshBatchDuplicates (#593)", () => {
  const ref = { orgId: "org-1", batchId: "batch-1" };
  const IN_BATCH = "duplicate: The same question is earlier in this import. Keep one of them.";

  function service(entries: unknown[], writes: Reply[] = [], files: unknown[] = []) {
    return fakeClient({
      ai_import_entries: [{ data: entries }, ...writes],
      ai_import_files: [{ data: files }],
    });
  }

  it("reads stems only, leaves dropped entries out, and answers each rewritten entry's version", async () => {
    const client = service(
      [
        { id: "a", position: 0, status: "dropped", reasons: [], stem: "Which food first?" },
        { id: "b", position: 1, status: "ready", reasons: [IN_BATCH], stem: "Which food first?" },
        { id: "c", position: 2, status: "ready", reasons: [], draftStem: "Which food first?" },
        {
          id: "d",
          position: 3,
          status: "ready",
          reasons: [],
          opening: "Which food first? A. Milk",
        },
      ],
      [{ data: [{ id: "b", version: 4 }] }, { data: [{ id: "c", version: 9 }] }],
    );
    const result = await refreshBatchDuplicates(client.client, ref);
    expect(result).toEqual({
      ok: true,
      versions: new Map([
        ["b", 4],
        ["c", 9],
      ]),
    });
    // "b" is now the first kept copy; "c" is the later one. "d" is a case study told apart by
    // its opening words, which are not the same twelve.
    expect(client.stepsOn("ai_import_entries", "update")).toEqual([
      [{ reasons: [] }],
      [{ reasons: [IN_BATCH] }],
    ]);
    const selected = String(client.stepsOn("ai_import_entries", "select")[0]?.[0]);
    expect(selected).not.toContain("source_excerpt");
    expect(selected).not.toMatch(/(^|, )(item|draft)(,|$)/);
    for (const table of ["ai_import_entries", "ai_import_files"]) {
      expect(client.stepsOn(table, "eq")).toContainEqual(["org_id", "org-1"]);
      expect(client.stepsOn(table, "eq")).toContainEqual(["batch_id", "batch-1"]);
    }
  });

  it("leaves out an entry at a removed file's place", async () => {
    const client = service(
      [
        { id: "stray", position: 0, status: "ready", reasons: [], stem: "Which food first?" },
        {
          id: "kept",
          position: 1000,
          status: "ready",
          reasons: [IN_BATCH],
          stem: "Which food first?",
        },
      ],
      [{ data: [{ id: "kept", version: 2 }] }],
      [
        { status: "rejected", rejected_reason: REMOVED_REASON },
        { status: "ready", rejected_reason: null },
      ],
    );
    await refreshBatchDuplicates(client.client, ref);
    expect(client.stepsOn("ai_import_entries", "update")).toEqual([[{ reasons: [] }]]);
  });

  it("says so when a read or a write fails, with a code only", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const readFails = fakeClient({
      ai_import_entries: [{ error: { code: "XX000" } }],
      ai_import_files: [{ data: [] }],
    });
    expect(await refreshBatchDuplicates(readFails.client, ref)).toEqual({
      ok: false,
      code: "unavailable",
    });
    const writeFails = service(
      [{ id: "b", position: 1, status: "ready", reasons: [IN_BATCH], stem: "Which food first?" }],
      [{ error: { code: "XX000" } }],
    );
    expect(await refreshBatchDuplicates(writeFails.client, ref)).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Which food");
  });
});
