import { safeNextPath } from "./nextPath";

// Authoring, and the student home (#205). The class invite page, /c/<token>, is deliberately not
// here: it is where someone with no account yet starts.
const PROTECTED_PREFIXES = ["/author", "/learn"];
const SIGN_IN_PATH = "/sign-in";

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The proxy's optimistic check: where to redirect this request, or null to let it through.
 * It only reads whether a session exists; pages and Server Functions still verify the user and
 * RLS still guards every row.
 */
export function redirectForAccess(url: URL, signedIn: boolean): URL | null {
  if (!signedIn && isProtected(url.pathname)) {
    const target = new URL(SIGN_IN_PATH, url.origin);
    target.searchParams.set("next", `${url.pathname}${url.search}`);
    return target;
  }
  if (signedIn && url.pathname === SIGN_IN_PATH) {
    return new URL(safeNextPath(url.searchParams.get("next")), url.origin);
  }
  return null;
}
