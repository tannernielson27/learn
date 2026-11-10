/**
 * The paths the proxy refreshes the Supabase session on. Until the device gate (ADR 0017) this
 * list was the proxy's whole matcher; the matcher now also sends every path on the staging host
 * through the proxy, so the proxy asks this list whether to do the session work. Keep it the same
 * as the first block of `config.matcher` in src/proxy.ts (`proxy.test.ts` checks).
 *
 * Each entry matches itself and anything under it, as `/x/:path*` does; the exact ones match only
 * themselves.
 */
const EXACT = ["/", "/pricing", "/learn", "/account", "/sign-in", "/sign-up", "/welcome"];
const WITH_CHILDREN = ["/author", "/learn", "/account", "/c", "/w", "/b", "/auth", "/gallery"];

export const SESSION_MATCHER = [
  "/",
  "/pricing",
  "/author/:path*",
  "/learn",
  "/learn/:path*",
  "/account",
  "/account/:path*",
  "/c/:path*",
  "/w/:path*",
  "/b/:path*",
  "/sign-in",
  "/sign-up",
  "/welcome",
  "/auth/:path*",
  "/gallery",
  "/gallery/:path*",
] as const;

export function needsSessionWork(pathname: string): boolean {
  if (EXACT.includes(pathname)) return true;
  return WITH_CHILDREN.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
