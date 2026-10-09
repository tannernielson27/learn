/**
 * `GET /api/health` (#237). Anyone may ask whether a deployment is ready; only a caller holding
 * `CRON_SECRET` learns which variable is missing.
 *
 * Public view: `{supabase, project, version, ready}`. `ready` folds every required variable, the
 * demo account and the sign-up CAPTCHA's setup into one boolean, so an anonymous caller cannot tell
 * which secret a deployment lacks (the conservative option: a list of missing names says which
 * feature is broken and where to look). It is briefly cacheable, so a CDN absorbs a flood.
 *
 * Detailed view, with `Authorization: Bearer <CRON_SECRET>`: adds a boolean per variable, whether
 * the demo account is on, and how the sign-up CAPTCHA is set up (`signUpCaptcha`). Never a value,
 * never cached. The secret is compared in constant time (`bearerMatches`); a wrong one gets 401
 * before anything else runs.
 *
 * No rate limit: the route reads no table, and its one network call (Supabase's auth health) is
 * memoised per server instance, so a flood that skips the CDN still reaches Supabase at most once
 * per instance every few seconds. The secret, 32+ random characters, is the boundary for the detail.
 */
import { httpsOrigin } from "@/lib/http/siteOrigin";
import { bearerMatches, MIN_SECRET_LENGTH } from "@/lib/reminders/cronRoute";
import {
  DEMO_ENV,
  REQUIRED_ENV,
  type DetailedHealth,
  type PublicHealth,
  type RequiredEnvName,
  type SignUpCaptcha,
} from "./envVars";

export type EnvSnapshot = Readonly<Record<string, string | undefined>>;

export interface SupabaseStatus {
  status: PublicHealth["supabase"];
  project: string;
}

export interface HealthDeps {
  env: EnvSnapshot;
  supabase: () => Promise<SupabaseStatus>;
  /**
   * `captchaSetup` from src/lib/auth/captcha.ts, the same reading sign-up acts on (#359). Handed
   * in, not read from `env`: that file alone names the Turnstile secret (`noClientCaptcha.test.ts`).
   */
  signUpCaptcha: () => SignUpCaptcha;
}

const PUBLIC_CACHE = "public, max-age=5, s-maxage=5";
const PRIVATE = "private, no-store";
const SHA = /^[0-9a-f]{7,40}$/i;
const VERSION_LENGTH = 12;

function present(value: string | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

function usableSecret(value: string | undefined): boolean {
  return (value ?? "").length >= MIN_SECRET_LENGTH;
}

/** The two setups in which every sign-up is refused (#359). */
const SIGN_UP_REFUSED: readonly SignUpCaptcha[] = ["missing", "misconfigured"];

/** Booleans only. CRON_SECRET counts only when the cron route would accept it (32+ characters). */
export function summarizeEnv(env: EnvSnapshot): Pick<DetailedHealth, "env" | "demoAccount"> {
  const entries = REQUIRED_ENV.map(({ name }): [RequiredEnvName, boolean] => [
    name,
    usable(name, env[name], env.VERCEL_ENV),
  ]);
  return {
    env: Object.fromEntries(entries) as Record<RequiredEnvName, boolean>,
    demoAccount: DEMO_ENV.some((name) => present(env[name])),
  };
}

/**
 * Set, and for the two with a shape, the right shape: a typo counts as missing. `SITE_URL` is a
 * production variable only; a preview's links use its own address (docs/05 §7.7 step 6).
 */
function usable(
  name: RequiredEnvName,
  value: string | undefined,
  vercelEnv: string | undefined,
): boolean {
  if (name === "CRON_SECRET") return usableSecret(value);
  if (name === "SITE_URL") return vercelEnv !== "production" || httpsOrigin(value) !== null;
  return present(value);
}

/** The deployed commit, shortened; anything that is not a SHA is reported, never echoed. */
export function deployedVersion(sha: string | undefined): string {
  const trimmed = (sha ?? "").trim();
  if (!trimmed) return "local";
  return SHA.test(trimmed) ? trimmed.slice(0, VERSION_LENGTH).toLowerCase() : "unknown";
}

function reply(body: object, status: number, cacheControl: string): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheControl, Vary: "Authorization" },
  });
}

function authorised(request: Request, secret: string | undefined): boolean {
  if (!secret || !usableSecret(secret)) return false;
  return bearerMatches(request.headers.get("authorization"), secret);
}

export async function handleHealth(request: Request, deps: HealthDeps): Promise<Response> {
  const wantsDetail = request.headers.has("authorization");
  if (wantsDetail && !authorised(request, deps.env.CRON_SECRET)) {
    return reply({ error: "unauthorized" }, 401, PRIVATE);
  }

  const { status, project } = await deps.supabase();
  const summary = summarizeEnv(deps.env);
  const signUpCaptcha = deps.signUpCaptcha();
  const ready =
    status === "ok" &&
    Object.values(summary.env).every(Boolean) &&
    !summary.demoAccount &&
    !SIGN_UP_REFUSED.includes(signUpCaptcha);
  const body: PublicHealth = {
    supabase: status,
    project,
    version: deployedVersion(deps.env.VERCEL_GIT_COMMIT_SHA),
    ready,
  };
  const httpStatus = status === "ok" ? 200 : 503;
  if (!wantsDetail) return reply(body, httpStatus, PUBLIC_CACHE);
  const detailed: DetailedHealth = { ...body, ...summary, signUpCaptcha };
  return reply(detailed, httpStatus, PRIVATE);
}

/**
 * Remembers Supabase's answer for `ttlMs` on this server instance, sharing one request between
 * concurrent callers. A rejected check is forgotten at once, so the next caller retries.
 */
export function createSupabaseMemo(
  check: () => Promise<SupabaseStatus>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<SupabaseStatus> {
  let cached: { at: number; result: Promise<SupabaseStatus> } | null = null;
  return () => {
    const at = now();
    if (cached && at - cached.at <= ttlMs) return cached.result;
    const result = check();
    cached = { at, result };
    result.catch(() => {
      if (cached?.result === result) cached = null;
    });
    return result;
  };
}
