/**
 * A per-IP limit on the two sign-in paths (#134).
 *
 * Why not the database, where #111 put the authoring limit: a sign-in runs before there is a
 * session, so a Postgres limiter would have to be callable by `anon` — the publishable key that
 * ships to every browser — with the address as an argument. Anyone could then spend a chosen
 * address's budget or fill the table with invented ones, which is a worse hole than the one being
 * closed. Reading the address inside Postgres instead does not work either: a Data API call is
 * made by this server, so the request headers Supabase sees carry Vercel's address, not the
 * person's. And #111's limiter fails closed, which is why an unapplied migration can refuse every
 * save; the same failure on sign-in would shut everyone out of the site.
 *
 * So the counter lives in the server's own memory. It needs no migration, adds no unauthenticated
 * surface, and cannot be skipped by calling the Server Function directly, because the Server
 * Function is what counts. Its limit: Vercel's functions share no memory, so a burst spread over
 * several warm instances can spend the budget once per instance. It still cuts the case this
 * story is about — one browser holding down the demo button, which keeps hitting one instance —
 * and a shared store can replace `createSignInRateLimiter` later without touching the callers.
 */

export const SIGN_IN_ACTIONS = ["email", "demo"] as const;

export type SignInAction = (typeof SIGN_IN_ACTIONS)[number];

export interface SignInLimit {
  attempts: number;
  windowMs: number;
}

const FIVE_MINUTES = 5 * 60_000;

/**
 * Supabase's own auth limit is 30 sign-ins per 5 minutes per IP, and it counts both paths in one
 * bucket. These two budgets add up to exactly that, in the same window, so the site refuses first
 * and says so plainly instead of letting Supabase's 429 land on whoever asks next.
 *
 * demo 10: one shared account that exists to be demonstrated. Nobody needs it ten times in five
 * minutes, and the button is public, so this is the half worth keeping tight.
 * email 20: the rest of the budget goes to real people. A class behind one school NAT that signs
 * in faster than 20 in five minutes is already over Supabase's ceiling, so no limit set here
 * could help it; that case needs the project's auth limits raised, not a looser limit here.
 */
export const SIGN_IN_LIMITS: Record<SignInAction, SignInLimit> = {
  email: { attempts: 20, windowMs: FIVE_MINUTES },
  demo: { attempts: 10, windowMs: FIVE_MINUTES },
};

/**
 * The same sentence whichever path tripped and whoever asked: it says nothing about whether an
 * address has an account, and nothing about the demo account's state.
 */
export const SIGN_IN_RATE_LIMITED =
  "Too many sign-in attempts from this network. Wait a few minutes, then try again.";

export type SignInRateLimitResult = { ok: true } | { ok: false; error: string };

/** One shared bucket for deployed requests whose address no header gives. */
export const UNIDENTIFIED_CALLER = "unidentified";

// Vercel sets all three and overwrites anything the client sent, so a forged header cannot pick
// another address (https://vercel.com/docs/headers/request-headers). Its own header first, then
// the two conventional ones.
const IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

// Long enough for any IPv6 address. The value is only ever a bucket key: never parsed, never
// stored, never logged.
const MAX_KEY_LENGTH = 64;

// Reaching this needs more distinct addresses in one window than this site will ever see.
const MAX_TRACKED = 10_000;

/**
 * The address this request came from, or null when nothing in front of the app identifies it.
 *
 * Null means the limiter has no question to answer — `next dev`, `next start` and the e2e run
 * reach the server directly — and bucketing every one of those callers together would only let
 * the site lock itself out. On the platform the headers are always set, so a deployed request
 * that somehow has none falls back to one shared bucket rather than escaping the limit.
 */
export function clientIp(
  requestHeaders: Headers,
  deployed: boolean = Boolean(process.env.VERCEL),
): string | null {
  for (const name of IP_HEADERS) {
    const firstHop = requestHeaders.get(name)?.split(",")[0]?.trim();
    if (firstHop) return firstHop.toLowerCase().slice(0, MAX_KEY_LENGTH);
  }
  return deployed ? UNIDENTIFIED_CALLER : null;
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
 * A fixed-window counter per address and path, in this process's memory. Fixed rather than
 * sliding, and calls over the limit are counted but capped, so hammering neither shortens nor
 * lengthens the wait — the same shape as #111's `private.take_rate_limit`.
 */
export function createSignInRateLimiter(
  limits: Record<SignInAction, SignInLimit> = SIGN_IN_LIMITS,
): SignInRateLimiter {
  const windows = new Map<string, CountedWindow>();
  const longestWindow = Math.max(...Object.values(limits).map((limit) => limit.windowMs));

  function forgetFinished(now: number): void {
    if (windows.size < MAX_TRACKED) return;
    for (const [key, counted] of windows) {
      if (now - counted.start >= longestWindow) windows.delete(key);
    }
    // Still full of live windows: that many distinct addresses inside one window is an attack,
    // not a class. Dropping the counts costs one window of limiting and keeps memory bounded.
    if (windows.size >= MAX_TRACKED) windows.clear();
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

      counted.calls = Math.min(counted.calls + 1, limit.attempts + 1);
      return counted.calls <= limit.attempts
        ? { ok: true }
        : { ok: false, error: SIGN_IN_RATE_LIMITED };
    },
    size: () => windows.size,
  };
}

const limiter = createSignInRateLimiter();

/**
 * Counts one sign-in attempt from this request's address, before the request reaches Supabase.
 * Both Server Functions in `app/sign-in/actions.ts` call this, so neither path can be hammered by
 * posting to it directly.
 */
export function takeSignInAttempt(
  requestHeaders: Headers,
  action: SignInAction,
): SignInRateLimitResult {
  return limiter.take(clientIp(requestHeaders), action);
}
