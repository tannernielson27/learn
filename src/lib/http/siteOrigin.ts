/** All this module reads, so a test can pass a plain `Headers`. */
export type RequestHeaders = Pick<Headers, "get">;

/**
 * The origin this request arrived on: what a link back to this site has to start with.
 *
 * `Origin` first, because a browser sets it on every form post and cannot be talked out of it.
 * Then the forwarded host, then the host, which is what a plain GET carries. All three are
 * client-controlled in principle, so nothing security-bearing may rest on the answer: a forged
 * Host header here yields a wrong link, not a wrong permission. #66 relies on Supabase's redirect
 * allow-list for the sign-in link, and #129's join URL only ever ends up inside a QR code drawn
 * for the host who asked for it.
 *
 * Pure: no React, no Next, no Supabase (`canonicalSiteOrigin` reads `process.env` only as a default).
 */
export function siteOrigin(requestHeaders: RequestHeaders): string {
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

/** The variables `canonicalSiteOrigin` reads; a test passes a plain object. */
export interface DeploymentEnv {
  /** Set by us: the production origin, which Supabase's Site URL and allow-list must name. */
  readonly SITE_URL?: string;
  readonly VERCEL_ENV?: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string;
  readonly VERCEL_URL?: string;
}

/**
 * The origin for a link that is handed to other people or sent by email: a class invite shown as
 * a QR code to a whole room, or the link in a sign-in email. Unlike `siteOrigin`, it never trusts
 * the request on Vercel: production uses `SITE_URL`, a preview uses the deployment's own address,
 * and only off Vercel (local development) does it fall back to the request.
 *
 * `SITE_URL` comes first in production because Supabase silently swaps a redirect that is not on
 * its allow-list for the bare Site URL, which the email template turns into a broken link (#304).
 * `VERCEL_PROJECT_PRODUCTION_URL` is only the fallback: Vercel picks it from the project's
 * domains, so it changes the moment a domain is added, and nothing tells Supabase.
 */
export function canonicalSiteOrigin(
  requestHeaders: RequestHeaders,
  env: DeploymentEnv = deploymentEnv(),
): string {
  if (env.VERCEL_ENV === "production") {
    const configured = httpsOrigin(env.SITE_URL);
    if (configured) return configured;
    if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return siteOrigin(requestHeaders);
}

/** The origin of an https URL, or null for anything else: a typo must not become a link. */
export function httpsOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  return url.protocol === "https:" ? url.origin : null;
}

function deploymentEnv(): DeploymentEnv {
  return {
    SITE_URL: process.env.SITE_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };
}
