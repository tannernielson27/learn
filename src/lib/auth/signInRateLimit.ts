import { isIP } from "node:net";

/**
 * Two counters on the sign-in paths: one on the caller (#134), one on the recipient (#139).
 *
 * The per-IP counter bounds what one caller spends. That is the right limit for what it is for,
 * but it counts the person asking, not the address being mailed: thirty attempts an IP, from as
 * many IPs as a script cares to use, is still an inbox full of links nobody asked for. So a
 * second counter is keyed on the email address itself and is spent whoever asks. #139 also turned
 * `shouldCreateUser` off, which is the larger half of that fix — an address with no account is
 * not mailed at all now — and this counter covers what remains: the addresses that do have
 * accounts.
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
 * So both counters live in the server's own memory. They need no migration, add no
 * unauthenticated surface, and cannot be skipped by calling the Server Function directly, because
 * the Server Function is what counts. Two limits to know about, and both bite harder on the
 * per-address counter than on the per-IP one:
 *
 * 1. Vercel's functions share no memory, so a burst spread over several warm instances can spend
 *    the budget once per instance. On the per-IP counter that only lets a caller spend more of
 *    their own budget. On the per-address counter it is worse, because the budget being
 *    multiplied belongs to a third party: N warm instances mean up to N budgets' worth of links
 *    into somebody else's inbox, and that somebody is not the one doing it.
 * 2. It bounds what any one caller spends of Supabase's auth budget; it does not bound the total.
 *    Supabase sees this server's egress address for every call, so its own per-IP limit is in
 *    effect one bucket shared by everyone using the site, and enough separate callers can still
 *    reach it together. That residual needs a deployment-wide ceiling or a shared store. The
 *    per-address counter narrows the same residual rather than closing it: it bounds what this
 *    deployment sends to one address, not what every address receives in total, and not what any
 *    other sender does.
 *
 * Both would be answered by the same change — a shared store behind `createSignInRateLimiter`,
 * which the callers would not notice. What this does fix is the case #134 was filed about: one
 * browser holding down the demo button, which at this site's traffic usually lands on the one
 * warm instance. Vercel promises no such affinity; it routes by capacity, not by caller.
 *
 * And one cost the per-address counter carries that the per-IP one does not: a caller who gets
 * past the per-IP limit can deliberately spend a chosen address's budget and keep its owner
 * waiting for a link that is never sent — silently, because a refusal here looks exactly like a
 * send (see `SIGN_IN_ADDRESS_LIMIT`). That is the same weakness the Postgres version was rejected
 * for above, except that here every spend costs a request that is itself counted against the
 * caller, and invented addresses land in a map that is bounded and evicted rather than a table
 * that grows. It is the price of not answering the question "does this address have an account?";
 * a larger budget would not remove it, only make it cost a few more requests. #139 chose that
 * trade knowingly.
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
 * Both are per calling address, and the window is fixed rather than sliding, so a caller who
 * waits out a window can spend up to two budgets back to back across the boundary. That is the
 * usual cost of a fixed window and is deliberate — it keeps the counter to one row per caller, as
 * #111's does.
 */
export const SIGN_IN_LIMITS = {
  email: { attempts: 30, windowMs: FIVE_MINUTES },
  demo: { attempts: 20, windowMs: FIVE_MINUTES },
} as const satisfies Record<SignInAction, SignInLimit>;

/**
 * 3 links to one email address in five minutes, whoever asked (#139).
 *
 * Far below the per-IP email budget of 30, and deliberately so: the argument that set 30 was a
 * class or a campus arriving together behind one address, and that argument does not transfer.
 * An email address is one person's inbox. One person needs one link — two or three if the first
 * went to a typo, or if the first is slow enough that they ask again. Past three inside five
 * minutes nothing honest is happening, and Supabase will not send a second link to the same
 * address inside sixty seconds in any case, so three requests is already near the most that can
 * turn into three emails.
 *
 * The cost is real and is accepted: somebody who asks a fourth time in the same window is told
 * their link was sent and gets nothing, because saying otherwise would answer a question about
 * the address (see `takeSignInAddress`). They will have had three, and the window is five
 * minutes. Lower than three would meet a frantic "resend" often enough to matter; higher would
 * buy a flooder another email per window for nothing.
 *
 * Fixed window, same as the two above, with the same back-to-back-across-the-boundary cost.
 */
export const SIGN_IN_ADDRESS_LIMIT: SignInLimit = { attempts: 3, windowMs: FIVE_MINUTES };

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

/**
 * The bucket key for an email address: trimmed, and lower-cased.
 *
 * `parseSignInForm` already does both before the address gets here, but the counter does its own
 * so that it cannot be weakened by a caller that forgets. Together they mean `Nurse@School.edu `
 * and `nurse@school.edu` share one budget instead of each getting a fresh one, which is the whole
 * point: trivial variations must not each buy another email.
 *
 * It stops there, and the reason is that every step further is a guess about somebody else's mail
 * server. Folding `user+tag@` down to `user@`, or dropping dots from a Gmail local part, would
 * catch a couple more variations — and would also hand anyone a way to spend an address's budget
 * without naming it: ask for `victim+1@school.edu` and `victim@school.edu` is the one that goes
 * quiet. Those rules are provider conventions, not standards, and applying them to a domain that
 * does not follow them merges two real, different mailboxes. Case and whitespace are safe by
 * comparison — the domain is case-insensitive by RFC 1035, every mailbox provider in practice
 * treats the local part that way too, and the sign-in form has already lower-cased what it stores
 * — so the counter matches what the form does and no more.
 */
export function normalizeSignInAddress(email: string): string {
  return email.trim().toLowerCase();
}

interface CountedWindow {
  start: number;
  calls: number;
}

export interface SignInRateLimiter {
  /** Counts one attempt and says whether it is within the limit. */
  take(ip: string | null, action: SignInAction, now?: number): SignInRateLimitResult;
  /**
   * Counts one link against the address it would be mailed to, and says whether to send it.
   *
   * A bare boolean, not a `SignInRateLimitResult`, and that is the point rather than a shortcut:
   * there is no message because the caller is never told. See `takeSignInAddress`.
   */
  takeAddress(email: string, now?: number): boolean;
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
  addressLimit: Readonly<SignInLimit> = SIGN_IN_ADDRESS_LIMIT,
): SignInRateLimiter {
  // Callers and recipients share one Map, so there is one bound and one eviction policy to
  // reason about. The keys cannot collide: an action key is an IP, which `clientIp` has already
  // checked is an IP, and an address key carries a prefix no action uses.
  const windows = new Map<string, CountedWindow>();
  const longestWindow = Math.max(
    addressLimit.windowMs,
    ...Object.values(limits).map((limit) => limit.windowMs),
  );

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

  /** Counts one call against `key` and says whether it stayed inside `limit`. */
  function within(key: string, limit: Readonly<SignInLimit>, now: number): boolean {
    forgetFinished(now);

    const counted = windows.get(key);
    if (!counted || now - counted.start >= limit.windowMs) {
      windows.set(key, { start: now, calls: 1 });
      return true;
    }

    // One counter behind a Map key, deliberately mutated in place rather than replaced.
    counted.calls = Math.min(counted.calls + 1, limit.attempts + 1);
    return counted.calls <= limit.attempts;
  }

  return {
    take(ip, action, now = Date.now()) {
      if (ip === null) return { ok: true };
      return within(`${action}:${ip}`, limits[action], now)
        ? { ok: true }
        : { ok: false, error: SIGN_IN_RATE_LIMITED };
    },
    // The address is the whole key: unlike `take`, there is nothing to opt out of off the
    // platform, because the recipient does not depend on where the request came from.
    takeAddress(email, now = Date.now()) {
      return within(`address:${normalizeSignInAddress(email)}`, addressLimit, now);
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

/**
 * Counts one link against the address it would be sent to, and says whether to send it.
 *
 * True means send. False means do not — and, the part that matters, say nothing about it.
 *
 * `SIGN_IN_RATE_LIMITED` tells a caller something about themselves: you have asked too often from
 * here. Nobody learns anything about anybody else from that, so saying it costs nothing and the
 * per-IP path says it. A refusal from this counter is the opposite. Its answer turns on an
 * address the caller typed and may not own, so any distinguishable response — another message,
 * another status, another shape — is an oracle: ask once, watch the answer change, and you have
 * learned that this address is one the site sends to. Alongside `shouldCreateUser: false`, which
 * makes Supabase itself refuse an address that has no account, a visible refusal here would have
 * traded an email-flooding bug for an account-existence bug, which is the worse of the two. So
 * this returns a bare boolean with no message to show, and `app/sign-in/actions.ts` answers a
 * false exactly as it answers a link that really was sent.
 */
export function takeSignInAddress(
  email: string,
  limiter: SignInRateLimiter = sharedLimiter,
): boolean {
  return limiter.takeAddress(email);
}
