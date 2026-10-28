/**
 * Counts the sequential round trips a server render or route makes, for the perf tests.
 *
 * Each faked read is a `trip`: it is logged with the wave it started in and held until the wave
 * ends. A wave ends when the code under test has started everything it can without an answer;
 * then every held read answers at once and the next wave begins. So a read's wave is its depth on
 * the critical path, and the last wave is the number of round trips in a row, which is what a
 * hosted database's latency multiplies.
 */
export interface Trip {
  name: string;
  wave: number;
}

export function roundTrips() {
  let wave = 1;
  let held: Array<() => void> = [];
  const log: Trip[] = [];

  /** A read named `name`, answering `value` (or what `value()` returns or throws) when its wave ends. */
  function trip<T>(name: string, value: T | (() => T)): Promise<Awaited<T>> {
    log.push({ name, wave });
    return new Promise<Awaited<T>>((resolve, reject) => {
      held.push(() => {
        try {
          const answer = typeof value === "function" ? (value as () => T)() : value;
          Promise.resolve(answer).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /** Drives `work` wave by wave until it settles; throws if it waits on something that is not a trip. */
  async function run<T>(
    work: () => Promise<T>,
  ): Promise<{ ok: true; value: T; waves: number } | { ok: false; error: unknown; waves: number }> {
    let outcome: { ok: true; value: T } | { ok: false; error: unknown } | null = null;
    work().then(
      (value) => {
        outcome = { ok: true, value };
      },
      (error: unknown) => {
        outcome = { ok: false, error };
      },
    );
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (outcome !== null) break;
      if (held.length === 0) throw new Error("stalled: waiting on something that is not a trip");
      const now = held;
      held = [];
      wave += 1;
      for (const answer of now) answer();
    }
    const settled = outcome as { ok: true; value: T } | { ok: false; error: unknown };
    return { ...settled, waves: Math.max(0, ...log.map((entry) => entry.wave)) };
  }

  /** The wave each named read started in. */
  const waveOf = (name: string) => log.find((entry) => entry.name === name)?.wave;

  return { trip, run, log, waveOf };
}
