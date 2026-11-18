import { afterEach, describe, expect, it, vi } from "vitest";
import { answerCounts, batchSource, finishExtraction, recordBatchSource } from "./finish";
import { readSegment } from "./segment";

afterEach(() => vi.restoreAllMocks());

const REF = { orgId: "org-1", batchId: "batch-1" };

describe("batchSource", () => {
  it("takes the first author and each line once, through #344's assembly", () => {
    expect(
      batchSource([
        { author: null, objectives: ["Assess  intake"], references: [] },
        {
          author: "Pine Hollow faculty",
          objectives: ["Assess  intake", "Plan care"],
          references: ["R"],
        },
        { author: "Someone else", objectives: [], references: ["R"] },
      ]),
    ).toEqual({
      author: "Pine Hollow faculty",
      objectives: ["Assess intake", "Plan care"],
      references: ["R"],
    });
    expect(batchSource([])).toEqual({ objectives: [], references: [] });
  });
});

const segment = (author: string | null) =>
  readSegment(
    { questions: [], answers: [], source: author ? { author } : undefined },
    { position: 0, of: 1, pageFrom: 1, pageTo: 1 },
    { type: "pdf", bytes: new Uint8Array() },
  );

/** A service client: two files, their chunks, the batch update and the duplicate pass's reads. */
function fakeService(
  options: {
    filesError?: boolean;
    chunks?: Record<string, unknown[]>;
    updateError?: boolean;
    entriesError?: boolean;
  } = {},
) {
  const updates: { table: string; values: unknown }[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let update: unknown = null;
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit"]) builder[method] = () => builder;
    builder.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    };
    builder.update = (values: unknown) => {
      update = values;
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) => {
      if (update !== null) {
        updates.push({ table, values: update });
        return resolve({ error: options.updateError ? { code: "x" } : null });
      }
      if (table === "ai_import_files") {
        return resolve(
          options.filesError
            ? { data: null, error: { code: "x" } }
            : { data: [{ id: "f1" }, { id: "f2" }], error: null },
        );
      }
      if (table === "ai_import_chunks") {
        const chunks = options.chunks ?? {
          f1: [{ id: "c1", position: 0, segments: segment(null) }],
          f2: [{ id: "c2", position: 0, segments: segment("Pine Hollow faculty") }],
        };
        return resolve({ data: chunks[filters.file_id as string] ?? [], error: null });
      }
      if (table === "ai_import_entries") {
        return resolve(
          options.entriesError ? { data: null, error: { code: "x" } } : { data: [], error: null },
        );
      }
      return resolve({ data: [], error: null });
    };
    return builder;
  };
  return { service: { from } as unknown as Parameters<typeof recordBatchSource>[0], updates };
}

describe("recordBatchSource and finishExtraction", () => {
  it("writes the batch's source matter from every file's segments", async () => {
    const { service, updates } = fakeService();
    expect(await recordBatchSource(service, REF)).toBe("ok");
    expect(updates).toEqual([
      {
        table: "ai_import_batches",
        values: {
          source: {
            author: "Pine Hollow faculty",
            objectives: [],
            references: [],
            unmatchedAnswers: 0,
            droppedAnswers: 0,
          },
        },
      },
    ]);
  });

  // #592: neither count was shown anywhere, so an answer section could vanish without a word.
  it("counts the answers that reached no question, across the batch's files", async () => {
    const question = (excerpt: string, number: string) => ({
      excerpt,
      number,
      type: "multiple_choice",
      confidence: 0.9,
      instructorNote: false,
      reliesOnImage: false,
      cutOff: false,
      continued: false,
    });
    const text =
      "1. Which action first?\n\n2. Which finding next?\n\nAnswer key\n1. B\n7. C\nKey: D";
    const first = readSegment(
      {
        questions: [question("Which action first?", "1"), question("Which finding next?", "2")],
        answers: [
          { number: "1", kind: "answer", text: "1. B" },
          // No question 7, and "Key" names none: both are left unmatched.
          { number: "7", kind: "answer", text: "7. C" },
          { number: "Key", kind: "answer", text: "Key: D" },
          // Not in the document at all: dropped when the chunk was read.
          { number: "2", kind: "answer", text: "2. A, made up" },
        ],
      },
      { position: 0, of: 1, pageFrom: null, pageTo: null },
      { type: "text", text },
    );
    expect(answerCounts([first])).toEqual({ unmatchedAnswers: 2, droppedAnswers: 1 });

    const { service, updates } = fakeService({
      chunks: {
        f1: [{ id: "c1", position: 0, segments: first }],
        f2: [{ id: "c2", position: 0, segments: { ...first, droppedAnswers: 3 } }],
      },
    });
    expect(await recordBatchSource(service, REF)).toBe("ok");
    expect(updates[0].values).toMatchObject({
      source: { objectives: [], references: [], unmatchedAnswers: 4, droppedAnswers: 4 },
    });
  });

  it("waits for a file whose chunks are not all segmented", async () => {
    const { service, updates } = fakeService({
      chunks: { f1: [{ id: "c1", position: 0, segments: null }] },
    });
    expect(await recordBatchSource(service, REF)).toBe("incomplete");
    expect(updates).toEqual([]);
    expect(await finishExtraction(service, REF)).toEqual({ ok: false, code: "incomplete" });
  });

  it("answers unavailable when a read or the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await recordBatchSource(fakeService({ filesError: true }).service, REF)).toBe(
      "unavailable",
    );
    expect(await recordBatchSource(fakeService({ updateError: true }).service, REF)).toBe(
      "unavailable",
    );
    expect(await finishExtraction(fakeService({ entriesError: true }).service, REF)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("records the source and then flags duplicates", async () => {
    const { service } = fakeService();
    expect(await finishExtraction(service, REF)).toEqual({ ok: true, duplicates: 0 });
  });
});
