import {
  BUSY_RETRIES,
  BUSY_RETRY_MS,
  PARALLEL_REQUESTS,
  RETRY_PAUSES_MS,
  runPool,
  type AiImportFailure,
  type BatchView,
  type ExtractAnswer,
  type FileHold,
  type ParseAnswer,
} from "./aiImportUpload";

/**
 * What the upload page does once a batch is reading (#345), in the browser, one request at a
 * time per part: every unread chunk of every ready file (three at once), then each file's extract
 * units (the first alone, so it warms Claude's cache of the document, then three at once), then
 * the finish. A reload runs this again from the batch as stored: a chunk already read and a unit
 * already staged answer at once, so it carries on where it stopped.
 *
 * A part that fails in a way that may not repeat is asked for again by itself (#591), after a
 * pause, before its file is marked failed. One file failing never stops another being read.
 *
 * Pure apart from the `io` it is handed, so it is tested without a browser.
 */

export interface DriverIo {
  parse: (batchId: string, fileId: string, position: number) => Promise<ParseAnswer>;
  extract: (batchId: string, fileId: string, unit: number) => Promise<ExtractAnswer>;
  finish: (batchId: string) => Promise<{ ok: true } | AiImportFailure>;
  sleep: (ms: number) => Promise<void>;
}

export interface DriverEvents {
  chunkRead: (fileId: string, position: number) => void;
  /** `done` of `total` units extracted; `staged` questions so far from this run. */
  unitsProgress: (fileId: string, done: number, total: number, staged: number) => void;
  fileFailed: (fileId: string, message: string) => void;
  /** Why nothing is moving on a file for now, or null once it is moving again. */
  fileHeld: (fileId: string, held: FileHold | null) => void;
  /** Questions not extracted because the batch reached 150. */
  overLimit: (count: number) => void;
}

export type DriveResult =
  | { status: "review" }
  /** Some file failed; the rest went as far as they could. "Try again" runs this again. */
  | { status: "partial"; failure?: AiImportFailure }
  /** Everything stopped: the cap, the hourly limit, or the batch is gone. */
  | { status: "stopped"; failure: AiImportFailure };

/** Answers that stop every file, not just the one that asked. */
const STOPS_EVERYTHING = new Set([
  // The teacher left the page.
  "cancelled",
  "cap_reached",
  "rate_limited",
  "not_found",
  "not_parsing",
  "signed_out",
  "forbidden",
  "disabled",
]);

/**
 * Failures worth another try without a click: our side or Claude's was unreachable, slow, or
 * answered something unreadable. A part that is too large, was declined, was cut off or has used
 * its tries would only fail the same way again, and each try is paid for.
 */
const WORTH_RETRYING = new Set(["unavailable", "claude_failed", "claude_timeout", "bad_answer"]);

type Answer = { ok: boolean; code?: string };

/** Counts the parts of each file that are waiting or being retried, and tells the page. */
function holdKeeper(emit: DriverEvents["fileHeld"]) {
  const counts = new Map<string, Record<FileHold, number>>();
  return (fileId: string, hold: FileHold, by: 1 | -1) => {
    const now = counts.get(fileId) ?? { waiting: 0, retrying: 0 };
    const next = { ...now, [hold]: now[hold] + by };
    counts.set(fileId, next);
    emit(fileId, next.waiting > 0 ? "waiting" : next.retrying > 0 ? "retrying" : null);
  };
}

export async function driveBatch(
  batch: BatchView,
  io: DriverIo,
  events: DriverEvents,
): Promise<DriveResult> {
  let stop: AiImportFailure | null = null;
  const failed = new Set<string>();
  const fail = (fileId: string, failure: AiImportFailure) => {
    if (STOPS_EVERYTHING.has(failure.code)) {
      stop ??= failure;
      return;
    }
    if (!failed.has(fileId)) events.fileFailed(fileId, failure.message);
    failed.add(fileId);
  };
  const halted = (fileId: string) => stop !== null || failed.has(fileId);
  const hold = holdKeeper(events.fileHeld);

  /** Asks again while another tab, an earlier visit or a failed try still holds the part. */
  async function untilFree<T extends Answer>(
    fileId: string,
    ask: () => Promise<T>,
  ): Promise<{ answer: T; waited: boolean }> {
    let answer = await ask();
    if (answer.ok || answer.code !== "busy") return { answer, waited: false };
    hold(fileId, "waiting", 1);
    for (let wait = 0; wait < BUSY_RETRIES && !answer.ok && answer.code === "busy"; wait += 1) {
      await io.sleep(BUSY_RETRY_MS);
      answer = await ask();
    }
    hold(fileId, "waiting", -1);
    return { answer, waited: true };
  }

  /** One part, with its new tries: the answer that stands once they are used up. */
  async function request<T extends Answer>(fileId: string, ask: () => Promise<T>): Promise<T> {
    let { answer } = await untilFree(fileId, ask);
    for (const pause of RETRY_PAUSES_MS) {
      if (answer.ok || !WORTH_RETRYING.has(answer.code ?? "") || halted(fileId)) break;
      hold(fileId, "retrying", 1);
      await io.sleep(pause);
      // Looked at again after the pause: another part may have stopped everything meanwhile (the
      // cap, the hourly limit) or failed this file, and then nothing more is sent for it.
      if (halted(fileId)) {
        hold(fileId, "retrying", -1);
        break;
      }
      const again = await untilFree(fileId, ask);
      hold(fileId, "retrying", -1);
      answer = again.answer;
      // A failed unit keeps its claim for minutes; a try that waited one out is the last.
      if (again.waited) break;
    }
    return answer;
  }

  const files = batch.files.filter((file) => file.status === "ready");

  // 1. Every chunk not read yet, three at once.
  const reads = files.flatMap((file) =>
    file.chunks
      .filter((chunk) => chunk.status !== "done")
      .map((chunk) => async () => {
        if (halted(file.id)) return;
        const answer = await request(file.id, () => io.parse(batch.id, file.id, chunk.position));
        if (answer.ok) events.chunkRead(file.id, chunk.position);
        else fail(file.id, answer);
      }),
  );
  await runPool(reads, PARALLEL_REQUESTS);

  // 2. Each file whose chunks are all read: its units, the first alone.
  let overLimit = 0;
  for (const file of files) {
    if (stop) break;
    if (failed.has(file.id)) continue;
    let done = 0;
    let staged = 0;
    const extract = async (unit: number): Promise<number | null> => {
      if (halted(file.id)) return null;
      const answer = await request(file.id, () => io.extract(batch.id, file.id, unit));
      if (!answer.ok) {
        fail(file.id, answer);
        return null;
      }
      done += 1;
      staged += answer.staged;
      overLimit += answer.overLimit;
      events.unitsProgress(file.id, done, answer.units, staged);
      return answer.units;
    };
    const units = await extract(0);
    if (units === null || units <= 1) continue;
    await runPool(
      Array.from({ length: units - 1 }, (_, index) => () => extract(index + 1)),
      PARALLEL_REQUESTS,
    );
  }
  if (overLimit > 0) events.overLimit(overLimit);

  if (stop) return { status: "stopped", failure: stop };
  if (failed.size > 0) return { status: "partial" };
  const finished = await io.finish(batch.id);
  if (!finished.ok) {
    return STOPS_EVERYTHING.has(finished.code)
      ? { status: "stopped", failure: finished }
      : { status: "partial", failure: finished };
  }
  return { status: "review" };
}
