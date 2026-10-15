import { afterEach, describe, expect, it, vi } from "vitest";
import { readSegment, type ChunkSegment } from "./segment";
import { loadFileSegments, readStoredSegment, storeChunkSegment } from "./segmentStore";
import { COURSE_ACTIVITY, activitySegment } from "./testing/extractRecordings";

afterEach(() => vi.restoreAllMocks());

const REF = { orgId: "org-1", batchId: "batch-1", fileId: "file-1" };

const segment = (position = 0): ChunkSegment =>
  readSegment(
    activitySegment,
    { position, of: 2, pageFrom: null, pageTo: null },
    { type: "text", text: COURSE_ACTIVITY },
  );

/** A service client whose one query answers `result`, recording the filters and the update. */
function fakeService(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["update", "select", "eq", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  const from = vi.fn(() => builder);
  return { service: { from } as unknown as Parameters<typeof loadFileSegments>[0], calls, from };
}

describe("readStoredSegment", () => {
  it("reads back what the segment pass wrote, through JSON", () => {
    const stored = JSON.parse(JSON.stringify(segment()));
    expect(readStoredSegment(stored)).toEqual(segment());
  });

  it("refuses anything else", () => {
    expect(readStoredSegment(null)).toBeNull();
    expect(readStoredSegment({ questions: [], answers: [] })).toBeNull();
    const wrongType = JSON.parse(JSON.stringify(segment()));
    wrongType.questions[0].type = "essay";
    expect(readStoredSegment(wrongType)).toBeNull();
  });
});

describe("storeChunkSegment", () => {
  it("writes the segment to the chunk at that file and position", async () => {
    const { service, calls, from } = fakeService({ data: [{ id: "c1" }], error: null });
    expect(await storeChunkSegment(service)(REF, 3, segment(3))).toBe("stored");
    expect(from).toHaveBeenCalledWith("ai_import_chunks");
    expect(calls[0]).toEqual({ method: "update", args: [{ segments: segment(3) }] });
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([
      ["file_id", "file-1"],
      ["batch_id", "batch-1"],
      ["org_id", "org-1"],
      ["position", 3],
    ]);
  });

  it("answers not_found for no such chunk, and unavailable on an error, logging only its code", async () => {
    expect(
      await storeChunkSegment(fakeService({ data: [], error: null }).service)(REF, 0, segment()),
    ).toBe("not_found");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await storeChunkSegment(fakeService({ data: null, error: { code: "23514" } }).service)(
        REF,
        0,
        segment(),
      ),
    ).toBe("unavailable");
    expect(log).toHaveBeenCalledWith(expect.any(String), { code: "23514" });
  });
});

describe("loadFileSegments", () => {
  it("reads every chunk's segment in order, with the chunk ids", async () => {
    const rows = [
      { id: "c0", position: 0, segments: segment(0) },
      { id: "c1", position: 1, segments: segment(1) },
    ];
    const result = await loadFileSegments(fakeService({ data: rows, error: null }).service, REF);
    expect(result).toEqual({
      ok: true,
      segments: [segment(0), segment(1)],
      chunkIds: new Map([
        [0, "c0"],
        [1, "c1"],
      ]),
    });
  });

  it("is incomplete while a chunk has no segment, or one stored under another position", async () => {
    const missing = [
      { id: "c0", position: 0, segments: segment(0) },
      { id: "c1", position: 1, segments: null },
    ];
    expect(
      await loadFileSegments(fakeService({ data: missing, error: null }).service, REF),
    ).toEqual({
      ok: false,
      code: "incomplete",
    });
    const moved = [{ id: "c0", position: 0, segments: segment(1) }];
    expect(await loadFileSegments(fakeService({ data: moved, error: null }).service, REF)).toEqual({
      ok: false,
      code: "incomplete",
    });
  });

  it("answers not_found for a file with no chunks, and unavailable on an error", async () => {
    expect(await loadFileSegments(fakeService({ data: [], error: null }).service, REF)).toEqual({
      ok: false,
      code: "not_found",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await loadFileSegments(fakeService({ data: null, error: { code: "x" } }).service, REF),
    ).toEqual({ ok: false, code: "unavailable" });
  });
});
