/**
 * Server-side verification of a Cloudflare Turnstile token (#359, ADR 0009). Open sign-up may say
 * an address already has an account, so it sits behind this and `takeSignUpAttempt`.
 *
 * Server only. `TURNSTILE_SECRET_KEY` can pass any token for the site, so this file must never be
 * reached from a Client Component; `noClientCaptcha.test.ts` walks the import graph to hold that.
 * What a browser may know (the site key, the field name) is in `turnstile.ts`.
 *
 * The request and the answer were checked against Cloudflare's documentation on 2026-10-06:
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 * A token is at most 2048 characters, lasts 300 seconds and verifies once: a second try with the
 * same token is refused (`timeout-or-duplicate`), so the form must reset the widget after a submit.
 */
import { clientIp, UNIDENTIFIED_CALLER, type RequestHeaders } from "./signInRateLimit";
import { CAPTCHA_FIELD_NAME, captchaSiteKey } from "./turnstile";

export const CAPTCHA_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare asks for a timeout and names none; five seconds is long for one small POST. */
export const CAPTCHA_TIMEOUT_MS = 5_000;

const MAX_TOKEN_LENGTH = 2048;

/** No token came with the form: the widget had not finished, or was never there. */
export const CAPTCHA_REQUIRED = "Finish the check that you are a person, then try again.";
/** Cloudflare refused the token: spent, expired, or made up. */
export const CAPTCHA_FAILED = "The check that you are a person did not pass. Try it again.";
/** The answer could not be had, or the keys are set up wrongly. Refused, never let through. */
export const CAPTCHA_UNAVAILABLE = "Signing up is not working just now. Try again in a moment.";

export type CaptchaResult = { ok: true } | { ok: false; error: string };

/**
 * - `off`: neither key is set. The check is skipped: local runs, e2e, a preview without keys.
 *   On a production deployment `verifyCaptcha` refuses instead: sign-up is never open there
 *   without the CAPTCHA.
 * - `on`: both are set.
 * - `misconfigured`: one without the other, or the secret under a `NEXT_PUBLIC_` name. Every
 *   request is refused, on every deployment, until it is fixed. A site key alone would draw a
 *   widget nobody verifies; a secret alone would demand a token no page can produce. Neither may
 *   pass for "off".
 */
export type CaptchaMode = "off" | "on" | "misconfigured";

export type CaptchaEnv = Readonly<Record<string, string | undefined>>;

const set = (value: string | undefined): boolean => (value ?? "").trim().length > 0;

export function captchaMode(env: CaptchaEnv = process.env): CaptchaMode {
  if (set(env.NEXT_PUBLIC_TURNSTILE_SECRET_KEY)) return "misconfigured";
  const site = captchaSiteKey(env) !== null;
  const secret = set(env.TURNSTILE_SECRET_KEY);
  if (site && secret) return "on";
  return site || secret ? "misconfigured" : "off";
}

function misconfiguration(env: CaptchaEnv): string {
  if (set(env.NEXT_PUBLIC_TURNSTILE_SECRET_KEY)) {
    return "NEXT_PUBLIC_TURNSTILE_SECRET_KEY is set, which publishes the secret: remove it, and roll the key in Cloudflare";
  }
  return set(env.TURNSTILE_SECRET_KEY)
    ? "TURNSTILE_SECRET_KEY is set without NEXT_PUBLIC_TURNSTILE_SITE_KEY"
    : "NEXT_PUBLIC_TURNSTILE_SITE_KEY is set without TURNSTILE_SECRET_KEY";
}

/** The token the widget put in a submitted form, or null. */
export function captchaTokenFrom(form: FormData): string | null {
  const value = form.get(CAPTCHA_FIELD_NAME);
  return typeof value === "string" ? value : null;
}

export interface VerifyCaptchaOptions {
  /** When given, the token must have been issued for this widget `action` (see `CaptchaField`). */
  action?: string;
  env?: CaptchaEnv;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

// Cloudflare's codes that say the token is at fault. Every other code (a bad or missing secret,
// `bad-request`, `internal-error`, one not listed today) is this site's trouble or Cloudflare's.
const TOKEN_AT_FAULT = new Set([
  "missing-input-response",
  "invalid-input-response",
  "timeout-or-duplicate",
]);

const REQUIRED: CaptchaResult = { ok: false, error: CAPTCHA_REQUIRED };
const FAILED: CaptchaResult = { ok: false, error: CAPTCHA_FAILED };
const UNAVAILABLE: CaptchaResult = { ok: false, error: CAPTCHA_UNAVAILABLE };

/** Only Cloudflare's own lower-case words reach the log, never a string that could carry a key. */
function knownCodes(body: Record<string, unknown>): string[] {
  const codes = body["error-codes"];
  if (!Array.isArray(codes)) return [];
  return codes.filter(
    (code): code is string => typeof code === "string" && /^[a-z-]{1,40}$/.test(code),
  );
}

function judge(body: unknown, action: string | undefined): CaptchaResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    console.error("[sign-up] the CAPTCHA verifier's answer was not an object; refused");
    return UNAVAILABLE;
  }
  const answer = body as Record<string, unknown>;
  if (answer.success !== true) {
    const codes = knownCodes(answer);
    if (codes.length > 0 && codes.every((code) => TOKEN_AT_FAULT.has(code))) return FAILED;
    console.error("[sign-up] the CAPTCHA verifier refused the request itself; refused", { codes });
    return UNAVAILABLE;
  }
  if (action !== undefined && answer.action !== action) {
    console.warn("[sign-up] a CAPTCHA token issued for another action was refused");
    return FAILED;
  }
  return { ok: true };
}

/**
 * Whether the request may go on. Call it from the Server Action, after the form has parsed and
 * `takeSignUpAttempt` has allowed the try, and before anything is created:
 *
 *   const captcha = await verifyCaptcha(captchaTokenFrom(formData), await headers(), {
 *     action: "sign-up",
 *   });
 *   if (!captcha.ok) return { status: "error", error: captcha.error };
 *
 * It never throws. With both keys unset it answers `{ ok: true }` without asking anyone, except on
 * a production deployment (`VERCEL_ENV`), where it refuses until the keys are there. With them
 * set, a missing token, a refused token, a wrong action, a timeout, an unreachable verifier, an
 * error status and an answer that is not JSON all refuse: nothing but a literal `success: true`
 * from a 2xx passes. A half-configured deployment refuses everything (see `CaptchaMode`).
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  requestHeaders: RequestHeaders,
  options: VerifyCaptchaOptions = {},
): Promise<CaptchaResult> {
  const env = options.env ?? process.env;
  const mode = captchaMode(env);
  if (mode === "off") {
    // Owner decision, 2026-10-07: production never signs anyone up without the CAPTCHA.
    if (env.VERCEL_ENV === "production") {
      console.error(
        "[sign-up] the CAPTCHA is not set up in production, so sign-up is refused: NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are not set (docs/05 §7.12)",
      );
      return UNAVAILABLE;
    }
    return { ok: true };
  }
  if (mode === "misconfigured") {
    console.error(
      `[sign-up] the CAPTCHA is set up wrongly, so sign-up is refused: ${misconfiguration(env)}`,
    );
    return UNAVAILABLE;
  }

  const response = token?.trim() ?? "";
  if (response.length === 0) return REQUIRED;
  if (response.length > MAX_TOKEN_LENGTH) return FAILED;

  const body = new URLSearchParams({ secret: (env.TURNSTILE_SECRET_KEY ?? "").trim(), response });
  const ip = clientIp(requestHeaders);
  if (ip !== null && ip !== UNIDENTIFIED_CALLER) body.set("remoteip", ip);

  try {
    const answer = await (options.fetch ?? fetch)(CAPTCHA_VERIFY_URL, {
      method: "POST",
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? CAPTCHA_TIMEOUT_MS),
    });
    if (!answer.ok) {
      console.error("[sign-up] the CAPTCHA verifier answered with an error; refused", {
        status: answer.status,
      });
      return UNAVAILABLE;
    }
    return judge(await answer.json(), options.action);
  } catch (error) {
    // The name only: a message could quote the request, and the request holds the secret.
    console.error("[sign-up] the CAPTCHA verifier could not be reached; refused", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return UNAVAILABLE;
  }
}
