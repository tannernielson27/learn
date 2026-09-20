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
 * Pure: no React, no Next, no Supabase.
 */
export function siteOrigin(requestHeaders: RequestHeaders): string {
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
