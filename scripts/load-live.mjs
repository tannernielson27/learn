// #187: runs a class-sized crowd of simulated students through a live session.
//
//     pnpm load:live --code ABC234 --participants 60        # a person drives the host console
//     pnpm load:live --host --participants 60               # the script drives the host too
//
// Each simulated student is a phone: its own join, its own httpOnly cookie, its own Realtime
// socket on the session's private channel, and its own answers to the keyless items the view route
// sends (see scripts/load-live/participant.mjs). It measures join time, view and submit latency,
// refusals by code, and the Realtime messages each participant received, prints a small table and
// writes the whole of it as JSON to --out for comparing runs.
//
// It refuses production: the production deployment by address, and any deployment whose database
// is production's (scripts/load-live/safety.mjs). It prints no keys, cookies or tokens.
// Docs: docs/load-testing.md.

import { writeFile } from "node:fs/promises";
import { createRng } from "./load-live/answers.mjs";
import { hostCredentials, openHostedSession } from "./load-live/host.mjs";
import { readOptions, USAGE } from "./load-live/options.mjs";
import { createParticipant } from "./load-live/participant.mjs";
import { formatTable, isUnexpectedRefusal, summarize } from "./load-live/report.mjs";
import { checkTarget, PRODUCTION_BASE, redact } from "./load-live/safety.mjs";

const HEALTH_TIMEOUT_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function projectAt(base) {
  try {
    const response = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const body = await response.json();
    return typeof body?.project === "string" ? body.project : null;
  } catch {
    return null;
  }
}

async function guard(options) {
  const targetProject = await projectAt(options.base);
  if (targetProject === null) throw new Error(`${options.base}/api/health did not answer.`);
  const productionProject = targetProject === "local" ? null : await projectAt(PRODUCTION_BASE);
  const verdict = checkTarget({
    base: options.base,
    supabaseUrl: options.supabaseUrl,
    targetProject,
    productionProject,
    extraProductionRefs: (process.env.LOAD_LIVE_PRODUCTION_REFS ?? "").split(",").filter(Boolean),
  });
  if (!verdict.ok) throw new Error(`Refusing to run. ${verdict.reason}`);
  return verdict.project;
}

/** Everything the participants report into, and what the host waits on. */
function createTally() {
  const tally = {
    timings: { join: [], view: [], submit: [] },
    refusals: {},
    refusalsByRoute: {},
    faults: [],
    steps: new Map(),
    measure(kind, ms) {
      tally.timings[kind].push(ms);
    },
    refused(route, code) {
      tally.refusals[code] = (tally.refusals[code] ?? 0) + 1;
      const key = `${route}:${code}`;
      tally.refusalsByRoute[key] = (tally.refusalsByRoute[key] ?? 0) + 1;
    },
    answered(position, how) {
      const step = tally.steps.get(position) ?? { sent: 0, blank: 0, refused: 0 };
      tally.steps.set(position, { ...step, [how]: step[how] + 1 });
    },
    failed(error) {
      tally.faults.push(error instanceof Error ? error.message : String(error));
    },
    settled(position) {
      const step = tally.steps.get(position);
      return step ? step.sent + step.blank + step.refused : 0;
    },
  };
  return tally;
}

function name(i, total) {
  const width = Math.max(2, String(total).length);
  return `Load ${String(i + 1).padStart(width, "0")}`;
}

async function joinAll(options, code, tally) {
  const rng = createRng(options.seed);
  const crowd = Array.from({ length: options.participants }, (_, i) =>
    createParticipant({
      displayName: name(i, options.participants),
      options,
      rng: createRng(Math.floor(rng() * 2 ** 31)),
      events: tally,
    }),
  );
  const outcomes = await Promise.all(
    crowd.map(async (participant, i) => {
      await sleep((options.rampMs * i) / Math.max(1, options.participants - 1));
      try {
        const entered = await participant.enter(code);
        if (!entered.ok) tally.refused("join", entered.refusal);
        return entered.ok;
      } catch (error) {
        tally.failed(error);
        tally.refused("join", "error");
        return false;
      }
    }),
  );
  return crowd.filter((_, i) => outcomes[i]);
}

function realtimeCounts(joined) {
  const totals = joined.map((p) => p.counts.state + p.counts.presence).sort((a, b) => a - b);
  const total = totals.reduce((sum, n) => sum + n, 0);
  return {
    total,
    state: joined.reduce((sum, p) => sum + p.counts.state, 0),
    presence: joined.reduce((sum, p) => sum + p.counts.presence, 0),
    perParticipant: {
      min: totals[0] ?? 0,
      median: totals[Math.floor(totals.length / 2)] ?? 0,
      max: totals.at(-1) ?? 0,
    },
  };
}

function results({ options, project, code, joined, tally, steps, startedAt }) {
  const perStep = [...tally.steps.entries()].sort(([a], [b]) => a - b);
  const unexpected = Object.entries(tally.refusals)
    .filter(([code]) => isUnexpectedRefusal(code))
    .reduce((sum, [, n]) => sum + n, 0);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    base: options.base,
    project,
    code,
    mode: options.host ? "host" : "code",
    seed: options.seed,
    participants: options.participants,
    joined: joined.length,
    join: summarize(tally.timings.join),
    view: summarize(tally.timings.view),
    submit: summarize(tally.timings.submit),
    submitted: perStep.reduce((sum, [, s]) => sum + s.sent, 0),
    skipped: perStep.reduce((sum, [, s]) => sum + s.blank, 0),
    refusals: tally.refusals,
    refusalsByRoute: tally.refusalsByRoute,
    unexpectedRefusals: unexpected,
    // With --host: steps whose answers never all arrived before the step timed out.
    stalledSteps: [...steps.values()].filter((step) => step.stalled).length,
    faults: tally.faults.slice(0, 20),
    realtime: realtimeCounts(joined),
    steps: perStep.map(([position, s]) => ({ position, ...s, ...(steps.get(position) ?? {}) })),
  };
}

async function waitForEnd(joined, options) {
  const deadline = Date.now() + options.maxMinutes * 60_000;
  while (Date.now() < deadline && !stop.aborted && !joined.every((p) => p.ended)) {
    await sleep(500);
  }
}

async function main() {
  const options = readOptions(process.argv.slice(2), process.env);
  if (options.help) return console.log(USAGE);
  const secrets = () => [
    options.publishableKey,
    process.env.LOAD_HOST_PASSWORD,
    process.env.DEMO_ACCOUNT_PASSWORD,
  ];
  const say = (text) => console.log(redact(text, secrets()));

  const project = await guard(options);
  const startedAt = new Date().toISOString();
  const tally = createTally();
  const steps = new Map();

  let host = null;
  let code = options.code;
  if (options.host) {
    host = await openHostedSession({ options, credentials: hostCredentials(process.env, project) });
    code = host.code;
    say(`Started a ${host.itemCount}-item session as the host. Code ${code}.`);
  }

  say(
    `Joining ${options.participants} participants to ${code} on ${options.base} (project ${project}).`,
  );
  const joined = await joinAll(options, code, tally);
  say(`${joined.length} joined.`);

  try {
    if (host) {
      await host.run({
        expected: joined.length,
        stopped: () => stop.aborted,
        settled: (position) => tally.settled(position),
        onStep: (step) => {
          steps.set(step.position, {
            answeredMs: step.answeredMs,
            stalled: step.settled < step.expected,
          });
          say(
            `  step ${step.position}: ${step.settled}/${step.expected} settled in ${step.answeredMs} ms, revealed`,
          );
        },
      });
    } else {
      say("Waiting for the host to run the session and end it (Ctrl+C stops early).");
      await waitForEnd(joined, options);
    }
  } finally {
    // Ended even when the run failed part way, so no load session is left open on the stack.
    if (host) {
      await host.end().catch((error) => tally.failed(error));
      // Long enough for the "ended" move to reach the phones before they hang up.
      await sleep(1000);
    }
    await Promise.allSettled(joined.map((p) => p.leave()));
  }

  const report = results({ options, project, code, joined, tally, steps, startedAt });
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
  say(`\n${formatTable(report)}\n\nResults written to ${options.out}`);
  const failed =
    report.joined < report.participants || report.unexpectedRefusals > 0 || report.stalledSteps > 0;
  if (failed) process.exitCode = 1;
}

/** Ctrl+C once: stop waiting and write what was measured. Twice: quit at once. */
const stopping = new AbortController();
const stop = stopping.signal;
process.on("SIGINT", () => {
  if (stop.aborted) process.exit(130);
  stopping.abort();
  console.log("\nStopping: writing what was measured. Ctrl+C again quits at once.");
});

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redact(message, [process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY]));
  process.exit(1);
});
