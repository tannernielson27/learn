import { isIP } from "node:net";

/**
 * A per-IP limit on the two sign-in paths (#134).
 *
 * Why not the database, where #111 put the authoring limit: a sign-in runs before there is a
 * session, so a Postgres limiter would have to be callable by `anon` — the publishable key that
 * ships to every browser — with the address as an argument. Anyone could then spend a chosen
 * address's budget or fill the table with invented ones, which is a worse hole than the one being
 * closed. Reading the address inside Postgres does not work either: a Data API call is made by
 * this server, so the request headers Supabase sees carry this server's address, not the
 * person's. And #111's limiter fails closed, which is why an unapplied migration can refuse every
 * save; the same failure on sign-in would shut everyone out of the site.
 *
 * So the counter lives in the server's own memory. It needs no migration, adds no unauthenticated
 * surface, and cannot be skipped by calling the Server Function directly, because the Server
 * Function is what counts. Two limits to know about:
 *
 * 1. Vercel's functions share no memory, so a burst spread over several warm instances can spend
 *    the budget once per instance.
 * 2. It bounds what any one caller spends of Supabase's auth budget; it does not bound the total.
 *    Supabase sees this server's egress address for every call, so its own per-IP limit is in
 *    effect one bucket shared by everyone using the site, and enough separate callers can still
 *    reach it together. That residual needs a deployment-wide ceiling or a shared store.
 *
 * Both would be answered by the same change — a shared store behind `createSignInRateLimiter`,
 * which the callers would not notice. What this does fix is the case #134 was filed about: one
 * browser holding down the demo button, which at this site's traffic usually lands on the one
 * warm instance. Vercel promises no such affinity; it routes by capacity, not by caller.
 *
 * This file assumes Vercel. Off the platform it does nothing at all (see `clientIp`), and the
 * header trust below would have to be revisited before running anywhere else.
 */

/** The two sign-in paths, each with its own budget. */
export type SignInAction = "email" | "demo";

export interface SignInLimit {
  attempts: number;
  windowMs: number;
}

/** All this module reads. Narrow, so a test can pass a plain `Headers`. */
export type RequestHeaders = Pick<Headers, "get" | "has">;

// Supabase's own auth limit runs in five minutes, so someone refused here is clear of Supabase's
// window by the time they can try again.
const FIVE_MINUTES = 5 * 60_000;

/**
 * email 30: a person needs one link, or two or three after a typo. Thirty leaves a school or
 * campus address room for a group arriving together — the case this must not break — while
 * cutting a script from thousands to thirty. Deliberately not lower: Supabase's own ceiling is 30
 * in the same window, and a smaller number would make this site the thing that refuses a real
 * class first, with nothing gained.
 * demo 20: one shared account that exists to be demonstrated. A room of visitors on one wifi each
 * clicking once fits inside twenty; a browser holding the button down does not.
 *
 * Both are per address, and the window is fixed rather than sliding, so a caller who waits out a
 * window can spend up to two budgets back to back across the boundary. That is the usual cost of
 * a fixed window and is deliberate — it keeps the counter to one row per caller, as #111's does.
 */
export const SIGN_IN_LIMITS = {
  email: { attempts: 30, windowMs: FIVE_MINUTES },
  demo: { attempts: 20, windowMs: FIVE_MINUTES },
} as const satisfies Record<SignInAction, SignInLimit>;

/**
 * The same sentence whichever path tripped and whoever asked: it says nothing about whether an
 * address has an account, and nothing about the demo account's state.
 */
export const SIGN_IN_RATE_LIMITED =
  "Too many sign-in attempts from this network. Wait a few minutes, then try again.";

export type SignInRateLimitResult = { ok: true } | { ok: false; error: string };

/** One shared bucket for a deployed request whose address no header gives. */
export const UNIDENTIFIED_CALLER = "unidentified";

// Vercel sets all three and overwrites anything the client sent, so a forged header cannot pick
// another address (https://vercel.com/docs/headers/request-headers). Its own header first, then
// the two conventional ones. They are read only when the request came through Vercel; nothing
// else may name its own address.
const IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

// Reaching this needs more distinct addresses inside one window than this site will ever see.
const MAX_TRACKED = 10_000;
const EVICT_TO = Math.floor(MAX_TRACKED * 0.9);

/**
 * Whether the request came through Vercel, which is the only place these headers can be trusted.
 * The environment variable is the usual signal; `x-vercel-id`, which Vercel sets on every request
 * it forwards, is a second one in case a project stops exposing system variables. Forging that
 * header somewhere else only turns the limit on for the forger, so it is safe to believe.
 */
function onVercel(requestHeaders: RequestHeaders): boolean {
  return Boolean(process.env.VERCEL) || requestHeaders.has("x-vercel-id");
}

/**
 * The address this request came from, or null when it did not come through Vercel.
 *
 * Null means the limiter has no question to answer. Next's own Node server fills x-forwarded-for
 * in from the socket when nothing in front of it did, so `next dev`, `next start` and the
 * Playwright auth run all arrive with an address that names only the machine running the tests;
 * counting them would let the site lock its own suite out, and believing a header off the
 * platform would let anyone name their own bucket. On Vercel an address always arrives, so a
 * deployed request that somehow has none falls into one shared bucket rather than escaping.
 */
export function clientIp(
  requestHeaders: RequestHeaders,
  deployed: boolean = onVercel(requestHeaders),
): string | null {
  if (!deployed) return null;
  for (const name of IP_HEADERS) {
    const firstHop = requestHeaders.get(name)?.split(",")[0]?.trim();
    // Anything that is not an address is not a bucket key either: no caller gets to invent one.
    if (firstHop && isIP(firstHop) !== 0) return firstHop.toLowerCase();
  }
  return UNIDENTIFIED_CALLER;
}

interface CountedWindow {
  start: number;
  calls: number;
}

export interface SignInRateLimiter {
  /** Counts one attempt and says whether it is within the limit. */
  take(ip: string | null, action: SignInAction, now?: number): SignInRateLimitResult;
  /** How many windows are being tracked. For tests. */
  size(): number;
}

/**
 * A fixed-window counter per address and path, in this process's memory. Calls over the limit are
 * counted but capped, so hammering neither shortens nor lengthens the wait — the same shape as
 * #111's `private.take_rate_limit`.
 */
export function createSignInRateLimiter(
  limits: Readonly<Record<SignInAction, Readonly<SignInLimit>>> = SIGN_IN_LIMITS,
): SignInRateLimiter {
  const windows = new Map<string, CountedWindow>();
  const longestWindow = Math.max(...Object.values(limits).map((limit) => limit.windowMs));

  function forgetFinished(now: number): void {
    if (windows.size < MAX_TRACKED) return;
    for (const [key, counted] of windows) {
      if (now - counted.start >= longestWindow) windows.delete(key);
    }
    if (windows.size < MAX_TRACKED) return;
    // Still that many live windows: more distinct addresses in five minutes than this site sees,
    // so it is a flood. Drop the ones nearest the end of their window rather than everything, so
    // a caller currently at their limit is the last to have it forgotten.
    const oldestFirst = [...windows.entries()].sort((a, b) => a[1].start - b[1].start);
    for (const [key] of oldestFirst) {
      if (windows.size <= EVICT_TO) break;
      windows.delete(key);
    }
  }

  return {
    take(ip, action, now = Date.now()) {
      if (ip === null) return { ok: true };

      const limit = limits[action];
      const key = `${action}:${ip}`;
      forgetFinished(now);

      const counted = windows.get(key);
      if (!counted || now - counted.start >= limit.windowMs) {
        windows.set(key, { start: now, calls: 1 });
        return { ok: true };
      }

      // One counter behind a Map key, deliberately mutated in place rather than replaced.
      counted.calls = Math.min(counted.calls + 1, limit.attempts + 1);
      return counted.calls <= limit.attempts
        ? { ok: true }
        : { ok: false, error: SIGN_IN_RATE_LIMITED };
    },
    size: () => windows.size,
  };
}

// Pinned to globalThis so an edit in development, which re-evaluates the module, does not hand
// everyone a fresh budget, and so two server bundles of this module cannot each keep their own.
const shared = globalThis as typeof globalThis & { __learnSignInRateLimiter?: SignInRateLimiter };
const sharedLimiter = (shared.__learnSignInRateLimiter ??= createSignInRateLimiter());

/**
 * Counts one sign-in attempt from this request's address, before the request reaches Supabase.
 * Both Server Functions in `app/sign-in/actions.ts` call this, so neither path can be hammered by
 * posting to it directly.
 */
export function takeSignInAttempt(
  requestHeaders: RequestHeaders,
  action: SignInAction,
  limiter: SignInRateLimiter = sharedLimiter,
): SignInRateLimitResult {
  return limiter.take(clientIp(requestHeaders), action);
}
