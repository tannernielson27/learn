// #187: where the load script is allowed to run.
//
// A run writes a class worth of participants and answers into the database behind the app it is
// pointed at. That must never be production's. Two checks, because either alone has a gap:
//
// 1. The production deployment's own address is refused outright.
// 2. The database is checked, not just the address. The target's `/api/health` names the Supabase
//    project it is on (ADR 0006), and a hosted target is refused when that is production's project
//    as production's own `/api/health` reports it. That catches a preview that shares production's
//    database — the case today, before the production split — which the address alone would let
//    through. When production's project cannot be read, a hosted target is refused: the check
//    fails closed. The local stack is never compared, so a local run does not touch production.
//
// Pure, so `safety.test.ts` can pin every branch.

export const PRODUCTION_BASE = "https://learn-tanner-nielsons-projects.vercel.app";

const PRODUCTION_HOSTS = new Set([new URL(PRODUCTION_BASE).hostname]);

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

const HOSTED_REF = /^([a-z0-9]{20})\.supabase\.co$/;

/** `local`, a 20-character project ref, or `unknown` — the same labels `/api/health` uses. */
export function projectRefOf(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? "").trim());
  } catch {
    return "unknown";
  }
  const host = parsed.hostname.toLowerCase();
  if (LOOPBACK.has(host)) return "local";
  return HOSTED_REF.exec(host)?.[1] ?? "unknown";
}

/**
 * @typedef {{ ok: true, project: string } | { ok: false, reason: string }} Verdict
 * @typedef {object} Target
 * @property {string} base
 * @property {string | undefined} supabaseUrl
 * @property {string | null} targetProject
 * @property {string | null | undefined} productionProject
 * @property {string[]} [extraProductionRefs]
 */

/** @returns {Verdict} */
const refuse = (/** @type {string} */ reason) => ({ ok: false, reason });

/**
 * Whether a run may go ahead.
 *
 * `targetProject` is what the target's `/api/health` reported; `productionProject` what
 * production's reported, or null when it was not asked (a local run) or did not answer.
 *
 * @param {Target} target
 * @returns {Verdict}
 */
export function checkTarget({
  base,
  supabaseUrl,
  targetProject,
  productionProject,
  extraProductionRefs = [],
}) {
  let parsedBase;
  try {
    parsedBase = new URL(base);
  } catch {
    return refuse(`--base is not a URL.`);
  }
  if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
    return refuse(`--base must be an http or https URL.`);
  }
  if (PRODUCTION_HOSTS.has(parsedBase.hostname.toLowerCase())) {
    return refuse(`${parsedBase.host} is the production deployment. Load runs never go there.`);
  }

  const project = projectRefOf(supabaseUrl);
  if (project === "unknown") {
    return refuse("The Supabase URL is neither the local stack nor a *.supabase.co project.");
  }
  if (extraProductionRefs.includes(project)) {
    return refuse(`Supabase project ${project} is on LOAD_LIVE_PRODUCTION_REFS.`);
  }
  if (targetProject !== project) {
    return refuse(
      `${parsedBase.host} reports Supabase project "${targetProject}", but the sockets would ` +
        `open on "${project}". Point --supabase-url at the app's own project.`,
    );
  }
  if (project === "local") return { ok: true, project };

  if (productionProject === null || productionProject === undefined) {
    return refuse(
      "Could not confirm which Supabase project production uses, so a hosted run is refused.",
    );
  }
  if (productionProject === project) {
    return refuse(
      `${parsedBase.host} runs on production's Supabase project (${project}). A load run there ` +
        "would write into production's database.",
    );
  }
  return { ok: true, project };
}

/** Replaces every occurrence of every non-empty secret with `[redacted]`. */
export function redact(text, secrets) {
  return secrets
    .filter((secret) => typeof secret === "string" && secret.length > 0)
    .reduce((out, secret) => out.split(secret).join("[redacted]"), String(text));
}
