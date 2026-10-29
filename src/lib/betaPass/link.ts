/**
 * A beta pass's page, `/b/<token>` (#520, ADR 0016): its path, the pages that send a visitor back
 * to it, the headers that keep its token off other sites, and every sentence it says.
 *
 * The owner sends the link by hand (`scripts/beta-pass.mjs issue`). Nothing in the interface
 * links to it, and nothing outside it names it: the sentences below are the page's alone, and say
 * nothing about why a link did not work, so a used, revoked, expired, unknown or someone else's
 * link reads the same.
 *
 * No React, Next or Supabase.
 */
import { clipInviteToken } from "@/lib/classes/classes";
import { nextLeadsTo } from "@/lib/workspace/invitePage";

const PREFIX = "/b";

/** `/b/<token>`. Clipped and escaped, so a value that is not a token cannot become a path. */
export function betaPassPath(token: string): string {
  return `${PREFIX}/${encodeURIComponent(clipInviteToken(token))}`;
}

/** Whether a request path is a beta pass page. */
export function isBetaPassPath(pathname: string): boolean {
  return pathname.startsWith(`${PREFIX}/`);
}

/** Sign-in, coming back to the pass afterwards. */
export function signInToRedeemPath(token: string): string {
  return `/sign-in?next=${encodeURIComponent(betaPassPath(token))}`;
}

/** Sign-up as a teacher, coming back to the pass afterwards (`carriedNext` in `signUp.ts`). */
export function signUpToRedeemPath(token: string): string {
  return `/sign-up?role=teacher&next=${encodeURIComponent(betaPassPath(token))}`;
}

/**
 * The headers the proxy adds to every answer under `/b/`, and to any page whose query string
 * carries a pass in `next` (sign-in, sign-up and the pages they pass it on to). The token is the
 * whole secret, so no Referer may carry it to another site, the CAPTCHA's included.
 */
export function betaPassResponseHeaders(
  pathname: string,
  search = "",
): Readonly<Record<string, string>> {
  return isBetaPassPath(pathname) || nextLeadsTo(search, isBetaPassPath)
    ? { "Referrer-Policy": "no-referrer" }
    : {};
}

/** The page's title and heading for a teacher, and its one line. */
export const BETA_PASS_TITLE = "Free access";
export const BETA_PASS_HEADING = "Free access for your workspace";
export const BETA_PASS_LINE = "Accept, and your workspace uses LeaRN free until this access ends.";

/** For a visitor: the page cannot tell them anything until they sign in as a teacher. */
export const BETA_PASS_SIGNED_OUT = "Sign in as a teacher, or create a teacher account, to go on.";

/**
 * The one answer for every link that does not work, and for anyone who is not a teacher. It never
 * says why.
 */
export const BETA_PASS_UNUSABLE = "This link cannot be used";

/** Checked before the link is looked at, so it says nothing about the link. */
export const BETA_PASS_RATE_LIMITED =
  "Too many tries from this network. Wait a few minutes, then try again.";

/** The database or the shared rate limiter could not answer. Says nothing about the link. */
export const BETA_PASS_UNAVAILABLE = "This page is not working just now. Try again in a moment.";

/** What the page's one form answers. On success it redirects instead. */
export type RedeemState =
  { status: "idle" } | { status: "unusable" } | { status: "error"; error: string };
