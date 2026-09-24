// ADR 0003 / #146: assert on the bytes a client receives, not on a component.
//
// The gate was first written as `notFound()` inside the gallery layout. The layout refused, its
// unit test passed, and the response still carried the answer keys: a layout and the page under
// it render concurrently, so ending the layout's segment does not stop the page subtree that has
// already rendered from being serialized into the same Flight stream. A 404 status and a 21KB
// body full of fixtures are not in conflict. Only a check on the response catches that, and only
// against a real build, because `next dev` and `next build` need not serialize the same things.
//
// Run against a built app:
//     node scripts/gallery-closed.mjs
// or against a server that is already up (a `next dev` on a laptop, for instance):
//     node scripts/gallery-closed.mjs --base http://127.0.0.1:3000 --expect closed
//
// With no `--base` this builds nothing: it expects `.next` to exist and starts `next start`
// twice, once as a preview deployment and once as production. The preview run is a control — it
// has to find the answer keys, otherwise a probe that silently fetched nothing would "pass" the
// production run and report a guarantee it never checked.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/** Every name the answer key and the scoring rule are serialized under. */
const FORBIDDEN = ["answerKey", "correctOptionId", "rationale", "scoring", "maxPoints"];

/**
 * Routes that must never answer with a key on production. Every route that imports `FIXTURES`
 * belongs here: today that is `/gallery/items/[type]`, `/gallery/live` and `/gallery/live/results`.
 * The gate is a blanket prefix match with no per-route logic, so a missing route is not a live
 * hole — but this list is
 * what would catch a future regression that is route-specific, and it can only catch what it
 * probes. `/gallery` itself is the index, and the case study carries its own fixture.
 */
const GALLERY_PATHS = [
  "/gallery/items/multiple_choice",
  "/gallery/case-study",
  "/gallery/live",
  "/gallery/live/results",
  // #235: the page that throws on purpose for the Sentry check. No key in it, but it must be 404
  // on production like the rest. Its `/server` handler is not probed: on a preview it answers 500
  // by design, which the open-gallery control above would count as a failure.
  "/gallery/sentry-check",
  "/gallery",
];

/** Not under /gallery: proves the gate is scoped and the server is actually serving. */
const CONTROL_PATH = "/";

const START_TIMEOUT_MS = 120_000;

function countMarkers(body) {
  return Object.fromEntries(FORBIDDEN.map((name) => [name, body.split(name).length - 1]));
}

async function probe(base, path) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const body = await response.text();
  return { path, status: response.status, bytes: body.length, markers: countMarkers(body), body };
}

const total = (markers) => Object.values(markers).reduce((sum, n) => sum + n, 0);

function report(result) {
  const counts = Object.entries(result.markers)
    .map(([name, n]) => `${name}:${n}`)
    .join(" ");
  return `${result.path.padEnd(34)} ${result.status}  ${String(result.bytes).padStart(7)}B  ${counts}`;
}

async function waitForServer(base, child) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`);
    try {
      await fetch(`${base}${CONTROL_PATH}`);
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`next start did not answer on ${base} within ${START_TIMEOUT_MS}ms`);
}

/**
 * Awaited, deliberately. An earlier round of this story left a `next dev` alive because the kill
 * was fired and never waited on, and the next run then failed on a port that looked free.
 */
async function stop(child) {
  if (child.exitCode !== null) return;
  // `next start` forks workers, so kill the whole group rather than the parent alone.
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    await new Promise((resolve) => {
      killer.on("close", resolve);
      killer.on("error", resolve);
    });
  } else {
    process.kill(-child.pid, "SIGKILL");
  }
}

/** Starts `next start` with VERCEL_ENV set to `vercelEnv`, probes every path, then stops it. */
async function probeBuiltApp(vercelEnv, port) {
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port) };
  if (vercelEnv === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = vercelEnv;

  const child = spawn(join("node_modules", ".bin", "next"), ["start", "--port", String(port)], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  try {
    await waitForServer(base, child);
    const results = [];
    for (const path of [...GALLERY_PATHS, CONTROL_PATH]) results.push(await probe(base, path));
    return results;
  } finally {
    await stop(child);
    await sleep(500);
  }
}

const failures = [];
const fail = (message) => failures.push(message);

/** The gallery is open and the probe can see answer keys in a response. */
function checkOpen(results) {
  console.log("\n-- control: VERCEL_ENV=preview, the gallery must be open --");
  for (const result of results) console.log("  " + report(result));

  const withKeys = results.filter((r) => r.path !== CONTROL_PATH && total(r.markers) > 0);
  if (withKeys.length === 0) {
    fail(
      "CONTROL FAILED: no gallery route served a single answer-key marker with the gallery open. " +
        "The probe cannot tell a closed gallery from a broken request, so the production run " +
        "below proves nothing. Check the paths and the markers in this script.",
    );
  }
  for (const result of results) {
    if (result.path !== CONTROL_PATH && result.status !== 200) {
      fail(`CONTROL FAILED: ${result.path} answered ${result.status} on a preview deployment.`);
    }
  }
}

/** The gallery is closed and no byte of a key reaches the client. */
function checkClosed(results) {
  console.log("\n-- VERCEL_ENV=production, the gallery must be closed --");
  for (const result of results) console.log("  " + report(result));

  for (const result of results) {
    if (result.path === CONTROL_PATH) {
      if (result.status !== 200)
        fail(`${CONTROL_PATH} answered ${result.status}; the gate is not scoped to /gallery.`);
      continue;
    }
    if (result.status !== 404) {
      fail(`${result.path} answered ${result.status}, expected 404.`);
    }
    const leaked = Object.entries(result.markers).filter(([, n]) => n > 0);
    if (leaked.length > 0) {
      const detail = leaked.map(([name, n]) => `${name} x${n}`).join(", ");
      const sample = /answerKey[^}]{0,120}/.exec(result.body)?.[0] ?? "";
      fail(
        `${result.path} returned ${result.status} but its ${result.bytes}-byte body still holds ` +
          `${detail}. A status is not a boundary. Sample: ${sample}`,
      );
    }
  }
}

const args = process.argv.slice(2);
const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined;
const expectArg = args.includes("--expect") ? args[args.indexOf("--expect") + 1] : undefined;

let checked;
if (baseArg) {
  const results = [];
  for (const path of [...GALLERY_PATHS, CONTROL_PATH]) results.push(await probe(baseArg, path));
  if (expectArg === "open") {
    checkOpen(results);
    checked = "the gallery is open and the probe can see answer keys in a response";
  } else {
    checkClosed(results);
    checked = "the gallery answers 404 with no answer key in the body";
  }
} else {
  checkOpen(await probeBuiltApp("preview", 3131));
  checkClosed(await probeBuiltApp("production", 3132));
  checked =
    "the built app serves the gallery on a preview deployment and answers a keyless 404 on production";
}

if (failures.length > 0) {
  console.error("\nFAILED — the gallery gate does not hold at the response level:\n");
  for (const message of failures) console.error("  * " + message + "\n");
  process.exit(1);
}
console.log(`\nOK — ${checked}.`);
