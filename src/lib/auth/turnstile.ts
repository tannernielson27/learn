/**
 * What the browser may know about the sign-up CAPTCHA, Cloudflare Turnstile (#359). Nothing here
 * reads the secret key: that is `captcha.ts`, which no Client Component may import
 * (`noClientCaptcha.test.ts`). `CaptchaField` and the server both import this file.
 *
 * Checked against Cloudflare's documentation on 2026-10-06:
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 * https://developers.cloudflare.com/turnstile/reference/content-security-policy/
 */

/** Explicit rendering: the script draws nothing until `turnstile.render` is called. */
export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The hidden input the widget adds to the form it sits in, holding the token. */
export const CAPTCHA_FIELD_NAME = "cf-turnstile-response";

/**
 * The origins a Content-Security-Policy must admit for the widget to load: its script, and the
 * frame the challenge runs in. The app sends no CSP today (there is none in `next.config.ts`, the
 * proxy or a `vercel.json`), so nothing reads this yet; whoever adds one starts from here.
 */
export const TURNSTILE_CSP_SOURCES = {
  "script-src": ["https://challenges.cloudflare.com"],
  "frame-src": ["https://challenges.cloudflare.com"],
} as const;

/**
 * The public site key, or null when the CAPTCHA is not set up. A page reads it on the server and
 * passes it to `<CaptchaField siteKey={...} />`, which renders nothing for null.
 */
export function captchaSiteKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const key = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key ? key : null;
}
