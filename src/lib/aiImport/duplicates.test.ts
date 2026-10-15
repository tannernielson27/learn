import { afterEach, describe, expect, it, vi } from "vitest";
import {
  duplicateReasons,
  entryStem,
  markDuplicates,
  stemHash,
  type EntryForDuplicates,
} from "./duplicates";
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
  it("reads the item's stem, else the draft's, else the excerpt", () => {
    expect(
      entryStem({ item: { stem: { value: "I" } }, draft: { stem: "D" }, source_excerpt: "E" }),
    ).toBe("I");
    expect(entryStem({ item: null, draft: { stem: "D" }, source_excerpt: "E" })).toBe("D");
    expect(entryStem({ item: null, draft: "x", source_excerpt: "E" })).toBe("E");
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
