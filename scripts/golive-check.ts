// #237: says whether production is ready for real students. Every automated line passes or fails;
// what no script can see prints as MANUAL with the docs/05 step to follow.
//
//     pnpm golive:check -- --url https://<site> --project-ref <ref> --publishable-key sb_publishable_...
//     pnpm golive:check -- --url http://127.0.0.1:3000 --local
//
// Read-only: SELECTs through the Supabase CLI (`supabase db query`, which uses your CLI login for
// a hosted project), GETs to the site and to PostgREST, and `gh` for the backup workflow. It never
// writes and never prints a secret. The judgements live in src/lib/golive, where they are tested;
// this file only wires them to the real processes. Node runs it directly (type stripping).

import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  checkedSupabase,
  defaultSupabaseUrl,
  readOptions,
  USAGE,
  type Target,
} from "../src/lib/golive/options.ts";
import { exitCode, formatReport } from "../src/lib/golive/report.ts";
import { redact, runGoLiveCheck } from "../src/lib/golive/run.ts";
import { migrationVersions, parseQueryRows, type Query } from "../src/lib/golive/sources.ts";

const ROOT = join(import.meta.dirname, "..");
const SUPABASE_BIN = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
const QUERY_TIMEOUT_MS = 60_000;
const GH_TIMEOUT_MS = 30_000;

/** Runs a program without a shell, so no argument is ever interpreted. Resolves to stdout. */
function run(file: string, args: readonly string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { cwd: ROOT, timeout, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr).trim() || error.message));
        else resolve(String(stdout));
      },
    );
  });
}

const supabase = (args: readonly string[]) =>
  run(process.execPath, [SUPABASE_BIN, ...args], QUERY_TIMEOUT_MS);

function queryFor(target: Target): Query {
  // The CLI takes --project-ref only alongside --linked; with it, the query goes to that ref through the
  // Management API, whatever project this checkout is linked to.
  const where = target.kind === "local" ? ["--local"] : ["--linked", "--project-ref", target.ref];
  return async (sql) =>
    parseQueryRows(await supabase(["db", "query", ...where, "-o", "json", sql]));
}

/** The local stack's API URL and publishable key (a public key), from `supabase status`. */
async function localStack(): Promise<{ url: string | null; key: string | null }> {
  try {
    const out = await supabase(["status", "-o", "json"]);
    const status = JSON.parse(out.slice(out.indexOf("{"))) as Record<string, unknown>;
    const pick = (name: string) => (typeof status[name] === "string" ? String(status[name]) : null);
    return { url: pick("API_URL"), key: pick("PUBLISHABLE_KEY") };
  } catch {
    return { url: null, key: null };
  }
}

async function main(): Promise<number> {
  const options = readOptions(process.argv.slice(2), process.env);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const local = options.target.kind === "local" ? await localStack() : { url: null, key: null };
  const url =
    options.supabaseUrl ??
    defaultSupabaseUrl(options.target) ??
    local.url ??
    "http://127.0.0.1:55321";
  const checked = checkedSupabase(url, options.publishableKey ?? local.key);
  const expectedProject = options.target.kind === "local" ? "local" : options.target.ref;

  console.log(`Go-live check: ${options.siteUrl} against ${expectedProject}\n`);
  const results = await runGoLiveCheck(
    {
      siteUrl: options.siteUrl,
      expectedProject,
      supabaseUrl: checked.url,
      publishableKey: checked.publishableKey,
      healthToken: options.healthToken,
      repoMigrations: migrationVersions(readdirSync(join(ROOT, "supabase", "migrations"))),
    },
    {
      query: queryFor(options.target),
      fetch: (input, init) => fetch(input, init),
      gh: (args) => run("gh", args, GH_TIMEOUT_MS),
      now: () => new Date(),
    },
  );
  console.log(formatReport(results));
  return exitCode(results);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`golive:check: ${redact(error)}\n`);
    console.error(USAGE);
    process.exitCode = 2;
  },
);
