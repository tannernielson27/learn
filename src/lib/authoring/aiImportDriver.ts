import {
  BUSY_RETRIES,
  BUSY_RETRY_MS,
  PARALLEL_REQUESTS,
  runPool,
  type AiImportFailure,
  type BatchView,
  type ExtractAnswer,
  type ParseAnswer,
} from "./aiImportUpload";

/**
 * What the upload page does once a batch is reading (#345), in the browser, one request at a
 * time per part: every unread chunk of every ready file (three at once), then each file's extract
 * units (the first alone, so it warms Claude's cache of the document, then three at once), then
 * the finish. A reload runs this again from the batch as stored: a chunk already read and a unit
 * already staged answer at once, so it carries on where it stopped.
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

/** Asks again while another tab or an earlier visit holds the part. */
async function untilFree<T extends { ok: boolean; code?: string }>(
  ask: () => Promise<T>,
  sleep: DriverIo["sleep"],
): Promise<T> {
  let answer = await ask();
  for (let wait = 0; wait < BUSY_RETRIES && !answer.ok && answer.code === "busy"; wait += 1) {
    await sleep(BUSY_RETRY_MS);
    answer = await ask();
  }
  return answer;
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
  const files = batch.files.filter((file) => file.status === "ready");

  // 1. Every chunk not read yet, three at once.
  const reads = files.flatMap((file) =>
    file.chunks
      .filter((chunk) => chunk.status !== "done")
      .map((chunk) => async () => {
        if (stop || failed.has(file.id)) return;
        const answer = await untilFree(() => io.parse(batch.id, file.id, chunk.position), io.sleep);
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
      if (stop || failed.has(file.id)) return null;
      const answer = await untilFree(() => io.extract(batch.id, file.id, unit), io.sleep);
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
