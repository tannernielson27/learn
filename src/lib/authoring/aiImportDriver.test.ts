import { describe, expect, it, vi } from "vitest";
import { driveBatch, type DriverEvents, type DriverIo } from "./aiImportDriver";
import {
  BUSY_RETRY_MS,
  RETRY_PAUSES_MS,
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
    fileHeld: vi.fn(),
    overLimit: vi.fn(),
  };
  return { io, events };
}

/** A second ready file after the first, so a test can see one file fail and the other carry on. */
const twoFiles: BatchView = {
  ...batch,
  files: [
    batch.files[0]!,
    {
      id: "f3",
      name: "three.md",
      status: "ready",
      reason: null,
      pages: 1,
      chunks: [{ position: 0, status: "pending" }],
      questions: 0,
    },
  ],
};

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

  // #591: a failure that may not repeat is tried again without a click.
  it("reads a part that fails twice with unavailable and then answers, with no click", async () => {
    let tries = 0;
    const { io, events } = harness((position) =>
      position === 2 && tries++ < 2
        ? failure("unavailable")
        : { ok: true, questions: 1, already: false },
    );
    expect(await driveBatch(batch, io, events)).toEqual({ status: "review" });
    expect(vi.mocked(io.parse).mock.calls.map((call) => call[2])).toEqual([1, 2, 2, 2]);
    // A pause before each new try, the second longer than the first.
    expect(vi.mocked(io.sleep).mock.calls.map((call) => call[0])).toEqual([...RETRY_PAUSES_MS]);
    expect(events.fileFailed).not.toHaveBeenCalled();
    expect(events.fileHeld).toHaveBeenCalledWith("f1", "retrying");
    expect(events.fileHeld).toHaveBeenLastCalledWith("f1", null);
    expect(io.finish).toHaveBeenCalledWith("b1");
  });

  it("marks only the file whose part keeps failing, and reads the other file", async () => {
    const { io, events } = harness();
    vi.mocked(io.parse).mockImplementation(async (_batch, fileId) =>
      fileId === "f1" ? failure("unavailable") : { ok: true, questions: 1, already: false },
    );
    expect(await driveBatch(twoFiles, io, events)).toEqual({ status: "partial" });
    expect(events.fileFailed).toHaveBeenCalledTimes(1);
    expect(events.fileFailed).toHaveBeenCalledWith("f1", messageFor("unavailable"));
    // The other file was read and its questions found; only the finish is held back.
    expect(events.chunkRead).toHaveBeenCalledWith("f3", 0);
    expect(vi.mocked(io.extract).mock.calls.every((call) => call[1] === "f3")).toBe(true);
    expect(io.extract).toHaveBeenCalled();
    expect(io.finish).not.toHaveBeenCalled();
  });

  it.each(["part_too_large", "spent", "claude_refused", "too_long"])(
    "does not try again after %s",
    async (code) => {
      const { io, events } = harness((position) =>
        position === 2 ? failure(code) : { ok: true, questions: 1, already: false },
      );
      expect(await driveBatch(batch, io, events)).toEqual({ status: "partial" });
      expect(vi.mocked(io.parse).mock.calls.map((call) => call[2])).toEqual([1, 2]);
      expect(io.sleep).not.toHaveBeenCalled();
    },
  );

  it.each(["claude_failed", "claude_timeout", "bad_answer"])(
    "tries again after %s, then gives up on the file",
    async (code) => {
      const { io, events } = harness((position) =>
        position === 2 ? failure(code) : { ok: true, questions: 1, already: false },
      );
      expect(await driveBatch(batch, io, events)).toEqual({ status: "partial" });
      const tries = vi.mocked(io.parse).mock.calls.filter((call) => call[2] === 2);
      expect(tries).toHaveLength(1 + RETRY_PAUSES_MS.length);
      expect(events.fileFailed).toHaveBeenCalledWith("f1", messageFor(code));
    },
  );

  it("says a file is waiting while a claim holds its part, and tries once after the wait", async () => {
    // The unit fails, its claim holds the next try (`busy`) twice, and the try after that fails.
    const answers: ExtractAnswer[] = [
      failure("claude_failed"),
      failure("busy"),
      failure("busy"),
      failure("claude_failed"),
    ];
    const { io, events } = harness(undefined, () => answers.shift() ?? failure("claude_failed"));
    expect(await driveBatch(batch, io, events)).toEqual({ status: "partial" });
    // Waiting out a claim takes minutes, so the try after it is the last without a click.
    expect(io.extract).toHaveBeenCalledTimes(4);
    expect(vi.mocked(io.sleep).mock.calls.map((call) => call[0])).toEqual([
      RETRY_PAUSES_MS[0],
      BUSY_RETRY_MS,
      BUSY_RETRY_MS,
    ]);
    expect(events.fileHeld).toHaveBeenCalledWith("f1", "waiting");
    expect(events.fileHeld).toHaveBeenLastCalledWith("f1", null);
    expect(events.fileFailed).toHaveBeenCalledTimes(1);
  });

  it("does not try again once the page has been left", async () => {
    const { io, events } = harness(() => failure("cancelled"));
    expect(await driveBatch(batch, io, events)).toMatchObject({ status: "stopped" });
    expect(io.sleep).not.toHaveBeenCalled();
  });

  // A part pausing before its new try must look again when it wakes: another part may have
  // reached the cap or the hourly limit meanwhile, and then nothing more is sent.
  it("sends no new try when everything stopped while a part was pausing", async () => {
    const { io, events } = harness();
    const wake: (() => void)[] = [];
    vi.mocked(io.sleep).mockImplementation(
      () => new Promise<void>((resolve) => void wake.push(resolve)),
    );
    let answerOther: (answer: ParseAnswer) => void = () => {};
    vi.mocked(io.parse).mockImplementation((_batch, fileId) =>
      fileId === "f1"
        ? Promise.resolve(failure("unavailable"))
        : new Promise<ParseAnswer>((resolve) => (answerOther = resolve)),
    );
    const driving = driveBatch(twoFiles, io, events);
    // Both parts of the first file have failed once and are pausing before their second try.
    await vi.waitFor(() => expect(wake).toHaveLength(2));
    answerOther(failure("rate_limited"));
    // The other file's answer is heard before either pause ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    wake.forEach((resolve) => resolve());

    expect(await driving).toEqual({ status: "stopped", failure: failure("rate_limited") });
    const firstFile = vi.mocked(io.parse).mock.calls.filter((call) => call[1] === "f1");
    expect(firstFile).toHaveLength(2);
    expect(io.sleep).toHaveBeenCalledTimes(2);
    // Nothing is left marked as being tried again.
    expect(events.fileHeld).toHaveBeenLastCalledWith("f1", null);
    expect(io.extract).not.toHaveBeenCalled();
    expect(io.finish).not.toHaveBeenCalled();
  });

  it("sends no new try for a file that another of its parts has failed meanwhile", async () => {
    const { io, events } = harness();
    const wake: (() => void)[] = [];
    vi.mocked(io.sleep).mockImplementation(
      () => new Promise<void>((resolve) => void wake.push(resolve)),
    );
    // Part 1 fails in a way worth another try; part 2 fails for good while part 1 is pausing.
    let answerSecond: (answer: ParseAnswer) => void = () => {};
    vi.mocked(io.parse).mockImplementation((_batch, _file, position) =>
      position === 1
        ? Promise.resolve(failure("unavailable"))
        : new Promise<ParseAnswer>((resolve) => (answerSecond = resolve)),
    );
    const driving = driveBatch(batch, io, events);
    await vi.waitFor(() => expect(wake).toHaveLength(1));
    answerSecond(failure("spent"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    wake.forEach((resolve) => resolve());

    expect(await driving).toEqual({ status: "partial" });
    expect(vi.mocked(io.parse).mock.calls.map((call) => call[2])).toEqual([1, 2]);
    expect(events.fileFailed).toHaveBeenCalledTimes(1);
    expect(events.fileFailed).toHaveBeenCalledWith("f1", messageFor("spent"));
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
