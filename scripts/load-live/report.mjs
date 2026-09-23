// #187: turning a load run's measurements into the table on stdout and the JSON beside it.
// Pure, so `report.test.ts` can pin it.

/** Nearest-rank percentile of a copy of `values`, or null when nothing was measured. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

const whole = (n) => (n === null ? null : Math.round(n));

/** Count, p50, p95, max and mean, in whole milliseconds. */
export function summarize(values) {
  if (values.length === 0) return { count: 0, p50: null, p95: null, max: null, mean: null };
  const total = values.reduce((sum, n) => sum + n, 0);
  return {
    count: values.length,
    p50: whole(percentile(values, 50)),
    p95: whole(percentile(values, 95)),
    max: whole(Math.max(...values)),
    mean: whole(total / values.length),
  };
}

/**
 * Refusals a real class runs into when an answer arrives just as the host moves: the item has
 * changed, the key is already showing, the timer ran out, the room is paused or over. Everything else — a rate limit,
 * an answer the route could not read, a participant it did not recognise, a server error — is a
 * fault in the room or in the script, and fails the run.
 */
const EXPECTED_REFUSALS = new Set([
  "wrong_item",
  "already_revealed",
  "not_started",
  "paused",
  "not_open",
  // #182: the item's timer ran out before the answer arrived.
  "time_up",
]);

export const isUnexpectedRefusal = (code) => !EXPECTED_REFUSALS.has(code);

const ms = (s) => (s.count === 0 ? "-" : `${s.p50} / ${s.p95} / ${s.max}  (n=${s.count})`);

const row = (label, value) => `  ${label.padEnd(18)} ${value}`;

/** The small table a run prints. Measurements only: no names, no cookies, no keys. */
export function formatTable(result) {
  const refusals = Object.entries(result.refusals)
    .map(([code, n]) => `${code}=${n}`)
    .join(" ");
  const rt = result.realtime.perParticipant;
  return [
    row("joined", `${result.joined} / ${result.participants}`),
    row("join ms", ms(result.join) + "   p50 / p95 / max"),
    row("view ms", ms(result.view)),
    row("submit ms", ms(result.submit)),
    row("answers", `${result.submitted} sent, ${result.skipped} left blank`),
    row("refusals", refusals || "none"),
    row("unexpected", String(result.unexpectedRefusals)),
    row("stalled steps", String(result.stalledSteps ?? 0)),
    row(
      "realtime msgs",
      `${result.realtime.total} total; per participant min ${rt.min} / median ${rt.median} / max ${rt.max}`,
    ),
  ].join("\n");
}
