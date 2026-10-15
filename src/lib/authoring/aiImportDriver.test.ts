import { describe, expect, it, vi } from "vitest";
import { driveBatch, type DriverEvents, type DriverIo } from "./aiImportDriver";
import {
  BUSY_RETRY_MS,
  messageFor,
  type BatchView,
  type ExtractAnswer,
  type ParseAnswer,
} from "./aiImportUpload";

const failure = (code: string) => ({ ok: false as const, code, message: messageFor(code) });

const batch: BatchView = {
  id: "b1",
  status: "parsing",
  files: [
    {
      id: "f1",
      name: "one.md",
      status: "ready",
      reason: null,
      pages: 2,
      chunks: [
        { position: 0, status: "done" },
        { position: 1, status: "pending" },
        { position: 2, status: "failed" },
      ],
      questions: 1,
    },
    {
      id: "f2",
      name: "two.doc",
      status: "rejected",
      reason: "No.",
      pages: null,
      chunks: [],
      questions: 0,
    },
  ],
};

function harness(
  parse: (position: number) => ParseAnswer = () => ({ ok: true, questions: 2, already: false }),
  extract: (unit: number) => ExtractAnswer = () => ({
    ok: true,
    units: 3,
    staged: 2,
    alreadyStaged: 0,
    overLimit: 0,
  }),
) {
  const io: DriverIo = {
    parse: vi.fn(async (_b, _f, position) => parse(position)),
    extract: vi.fn(async (_b, _f, unit) => extract(unit)),
    finish: vi.fn(async () => ({ ok: true as const })),
    sleep: vi.fn(async () => undefined),
  };
  const events: DriverEvents = {
    chunkRead: vi.fn(),
    unitsProgress: vi.fn(),
    fileFailed: vi.fn(),
    overLimit: vi.fn(),
  };
  return { io, events };
}

describe("driveBatch", () => {
  it("reads the unread chunks, extracts every unit (the first alone), then finishes", async () => {
    const { io, events } = harness();
    expect(await driveBatch(batch, io, events)).toEqual({ status: "review" });
    // The chunk read already is not sent again; the refused file is not touched.
    expect(vi.mocked(io.parse).mock.calls.map((call) => call[2])).toEqual([1, 2]);
    expect(vi.mocked(io.extract).mock.calls.map((call) => call[2])).toEqual([0, 1, 2]);
    expect(events.chunkRead).toHaveBeenCalledTimes(2);
    expect(events.unitsProgress).toHaveBeenLastCalledWith("f1", 3, 3, 6);
    expect(io.finish).toHaveBeenCalledWith("b1");
  });

  it("waits while another tab holds a part, then carries on", async () => {
    let calls = 0;
    const { io, events } = harness((position) =>
      position === 1 && calls++ < 2 ? failure("busy") : { ok: true, questions: 0, already: true },
    );
    expect(await driveBatch(batch, io, events)).toEqual({ status: "review" });
    expect(io.sleep).toHaveBeenCalledWith(BUSY_RETRY_MS);
    expect(io.sleep).toHaveBeenCalledTimes(2);
  });

  it("stops everything at the cap and does not finish", async () => {
    const { io, events } = harness(() => failure("cap_reached"));
    const result = await driveBatch(batch, io, events);
    expect(result).toEqual({ status: "stopped", failure: failure("cap_reached") });
    expect(io.extract).not.toHaveBeenCalled();
    expect(io.finish).not.toHaveBeenCalled();
  });

  it("marks one file failed when Claude fails, and leaves the batch to try again", async () => {
    const { io, events } = harness((position) =>
      position === 2 ? failure("claude_failed") : { ok: true, questions: 1, already: false },
    );
    expect(await driveBatch(batch, io, events)).toEqual({ status: "partial" });
    expect(events.fileFailed).toHaveBeenCalledWith("f1", messageFor("claude_failed"));
    expect(io.extract).not.toHaveBeenCalled();
    expect(io.finish).not.toHaveBeenCalled();
  });

  it("reports questions left out past 150, and an extract failure", async () => {
    const over = harness(undefined, () => ({
      ok: true,
      units: 1,
      staged: 0,
      alreadyStaged: 0,
      overLimit: 4,
    }));
    await driveBatch(batch, over.io, over.events);
    expect(over.events.overLimit).toHaveBeenCalledWith(4);

    const broken = harness(undefined, (unit) =>
      unit === 1
        ? failure("unavailable")
        : { ok: true, units: 3, staged: 1, alreadyStaged: 0, overLimit: 0 },
    );
    expect(await driveBatch(batch, broken.io, broken.events)).toEqual({ status: "partial" });
    expect(broken.events.fileFailed).toHaveBeenCalledTimes(1);
  });

  it("passes on a refused finish", async () => {
    const { io, events } = harness();
    vi.mocked(io.finish).mockResolvedValueOnce(failure("incomplete"));
    expect(await driveBatch(batch, io, events)).toEqual({
      status: "partial",
      failure: failure("incomplete"),
    });
    vi.mocked(io.finish).mockResolvedValueOnce(failure("not_parsing"));
    expect(await driveBatch(batch, io, events)).toEqual({
      status: "stopped",
      failure: failure("not_parsing"),
    });
  });
});
