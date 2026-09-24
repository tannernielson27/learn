import { isIP } from "node:net";

/**
 * Three counters on the sign-in paths: one on the caller (#134), two on the recipient (#139). A
 * fourth, on the class invite path only, takes the caller's place once an invite token has
 * resolved (#217): see `SIGN_IN_INVITE_LIMIT`.
 *
 * The per-IP counter bounds what one caller spends. That is the right limit for what it is for,
 * but it counts the person asking, not the address being mailed: thirty attempts an IP, from as
 * many IPs as a script cares to use, is still an inbox full of links nobody asked for. So #139
 * added counting on the recipient, and turned `shouldCreateUser` off — the larger half of that
 * fix, because an address with no account is now not mailed at all. What the counters cover is
 * what remains: the addresses that do have accounts.
 *
 * The recipient is counted twice, and the reason is worth keeping. #139 first shipped one bucket
 * per address, spendable by anyone. Review found that this is a lockout: with self-serve sign-up
 * gone the emailed link is an author's only way into the site, so one caller who knew an author's
 * address could spend that bucket every five minutes for ever and keep a named person out —
 * invisibly, because a refusal has to look exactly like a send (see `takeSignInAddress`). The
 * silence that closes the account-existence oracle is the same silence that would have hidden the
 * attack. The two requirements pull against each other, and one bucket resolved the tension
 * entirely in favour of the oracle. So:
 *
 * - per caller and address together, a small budget. This is what actually answers the case #139
 *   was filed about — one caller mailing a stranger hundreds of times an hour — and no third
 *   party can spend it, because the caller is half of the key.
 * - per address overall, a distinctly higher ceiling. This keeps #139's "regardless of which IP
 *   asks" against a flood spread across many callers.
 *
 * The ceiling is shared and so it is still a lever: enough distinct callers can hold it down and
 * the owner is refused with them. What changed is the price — several callers rather than one
 * browser — and that the ceiling refusing is written to the log, without the address, so an
 * operator can see that a campaign is running even though its target stays hidden. That is the
 * honest state of it. A ceiling on an address that a stranger cannot spend does not exist,
 * because a stranger's request and the owner's own request are the same request.
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
 * So all the counters live in the server's own memory. They need no migration, add no
 * unauthenticated surface, and cannot be skipped by calling the Server Function directly, because
 * the Server Function is what counts. Two limits to know about, and both bite hardest on the
 * address ceiling, which is the only one of the three that a third party can spend:
 *
 * 1. Vercel's functions share no memory, so a burst spread over several warm instances can spend
 *    the budget once per instance. On the two per-caller counters that only lets a caller spend
 *    more of their own budget. On the address ceiling it cuts both ways: N warm instances mean up
 *    to N ceilings' worth of requests forwarded for one address, and equally N times as many
 *    callers needed to hold that address's ceiling down everywhere at once.
 * 2. It bounds what any one caller spends of Supabase's auth budget; it does not bound the total.
 *    Supabase sees this server's egress address for every call, so its own per-IP limit is in
 *    effect one bucket shared by everyone using the site, and enough separate callers can still
 *    reach it together. That residual needs a deployment-wide ceiling or a shared store. The
 *    address ceiling narrows the same residual rather than closing it: it bounds what this
 *    deployment forwards for one address, not what every address receives in total, and not what
 *    any other sender does.
 *
 * Both would be answered by the same change — a shared store behind `createSignInRateLimiter`,
 * which the callers would not notice. What this does fix is the case #134 was filed about: one
 * browser holding down the demo button, which at this site's traffic usually lands on the one
 * warm instance. Vercel promises no such affinity; it routes by capacity, not by caller.
 *
 * This file assumes Vercel. Off the platform it does nothing at all (see `clientIp`), and the
 * header trust below would have to be revisited before running anywhere else. That caveat now
 * carries more weight than it did when only #134 depended on it: with no caller to key on, the
 * per-caller-and-address tier short-circuits away and every request falls through to the ceiling
 * alone — which is exactly the single-bucket shape review rejected above. It does not arise on
 * Vercel, which stamps `x-vercel-id` on every request it forwards whether or not a project
 * exposes system environment variables. But self-hosting this, or putting a different proxy in
 * front of it, lands there, and `clientIp` would have to be taught about that proxy before the
 * per-caller tier means anything at all.
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
 * The two counters on the recipient (#139).
 *
 * `perCaller` 3, keyed on the caller and the address together. An email address is one person's
 * inbox, so the argument that set the per-IP email budget at 30 — a class or a campus arriving
 * together behind one address — does not transfer. One person needs one link, or two or three
 * after a typo or a slow inbox. This is the counter that answers #139's scenario, one caller
 * mailing a stranger over and over, and it can be kept this tight precisely because spending it
 * refuses nobody but the caller who spent it.
 *
 * `overall` 12, keyed on the address alone: the ceiling that holds when a flood is spread over
 * many callers, which #139 asked for in as many words. Four times `perCaller`, so that a real
 * person moving between networks — phone on cellular, laptop on wifi, a campus that hands out a
 * new address on reconnect — has room for several whole budgets before the ceiling is anywhere
 * near. That headroom matters more here than tightness, because somebody refused by this counter
 * is refused silently and, with sign-up gone, has no other way in. Deliberately not looser
 * either: twelve forwarded requests in five minutes are at most about five emails, since GoTrue
 * will not send a second link to one address inside sixty seconds and refuses the rest, so a
 * higher ceiling would buy a flooder no extra mail at all — only more of the deployment's shared
 * Supabase auth budget spent on one address.
 *
 * The three numbers are meant to be read in order: 3 per caller and address, 12 per address, 30
 * per caller across every address (`SIGN_IN_LIMITS.email`). One caller hammering one address
 * meets the first, a flood on one address meets the second, and the third still bounds what any
 * one caller spends in total. It also means a caller needs four addresses of its own to hold one
 * ceiling down, and each of the four keeps paying against its own 30.
 *
 * Fixed windows, like the two above, with the same back-to-back-across-the-boundary cost.
 */
export const SIGN_IN_ADDRESS_LIMITS = {
  perCaller: { attempts: 3, windowMs: FIVE_MINUTES },
  overall: { attempts: 12, windowMs: FIVE_MINUTES },
} as const satisfies Record<"perCaller" | "overall", SignInLimit>;

/**
 * The budget a class invite request earns once its token has resolved (#217), keyed on the class
 * and the caller together, in place of the per-IP email budget above.
 *
 * Why the invite path needs its own: a class on campus Wi-Fi reaches this server from one public
 * address (NAT), so the thirty-first student to open the link in the same five minutes was refused
 * — on the first day, which is when it matters. Thirty was set for plain sign-in, where an address
 * with no account is not mailed at all; it was never meant to admit a whole class at once.
 *
 * 120: a sixty-student class with a retry each. Earned only by a token `resolve_class_invite` has
 * just matched, so a caller with no valid token never sees it — an unknown, rotated, malformed or
 * absent token still spends the per-IP email budget exactly as before (see
 * `app/c/[token]/actions.ts`). What a larger budget hands to someone who holds a real link (a
 * student can forward it) is recorded here because it is the price of the fix:
 *
 * - Up to 120 addresses mailed per class per caller in five minutes, instead of 30. Each address is
 *   still bounded by `SIGN_IN_ADDRESS_LIMITS` (3 per caller, 12 overall), which this does not touch,
 *   so no one inbox gets more than it did. What grows is the number of strangers one holder can
 *   reach, and the number of never-signed-in student accounts they can leave on that class's roster
 *   — the invite path is the one that creates accounts (#205).
 * - Rotating the invite ends it: the old token stops resolving, and its holder is back on 30.
 * - Supabase's own Auth email limit (docs/05 §7.7 step 4, 150 an hour in production) is shared by
 *   the whole deployment and is the next ceiling a large class meets; it is what really bounds a
 *   holder spraying addresses, and a class of sixty spends a good part of it at once.
 * - The lockout of #159 keeps its shape: one address's ceiling is still 12 and one caller's share
 *   of it is still 3, so holding any one address down still takes four callers. What changes is
 *   breadth. A caller's 3 per address against 30 in total let four callers hold about ten
 *   addresses down at once; against 120 it is about forty — but only while they hold a live invite,
 *   and only until it is rotated. A caller with no valid token is exactly where #159 left them.
 */
export const SIGN_IN_INVITE_LIMIT = {
  attempts: 120,
  windowMs: FIVE_MINUTES,
} as const satisfies SignInLimit;

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

// Sized when every key was a caller's address, where reaching it needed ten thousand distinct
// callers in one window. #139's recipient keys change that arithmetic and the number was not
// re-tuned: a caller's thirty email attempts can now leave up to thirty address keys and thirty
// pair keys behind as well as its own, so sixty-one keys a caller, and a couple of hundred
// callers reach ten thousand. #217's invite budget stretches that again for a caller holding a
// live invite — up to 120 address and 120 pair keys a class — and it was still not re-tuned: at
// this site's traffic ten thousand is a flood either way. Left as it is on purpose. Eviction below still bounds the memory
// and still drops the windows nearest their end first, so the worst a flood buys is somebody's
// window starting over early — never a refusal, and never a lockout.
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
 * catch a couple more variations — and would also hand anyone a way to spend an address's ceiling
 * without naming it: ask for `victim+1@school.edu` and `victim@school.edu` is the one that goes
 * quiet. Those rules are provider conventions, not standards, and applying them to a domain that
 * does not follow them merges two real, different mailboxes. There is also nothing left to catch:
 * with `shouldCreateUser: false` GoTrue matches the registered address exactly, so a sub-addressed
 * variant is simply an address with no account and is never mailed at all. Case and whitespace are
 * different — the domain is case-insensitive by RFC 1035, every mailbox provider in practice
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

/**
 * Whether to mail this address, and — only for the log — which counter said no.
 *
 * Not a `SignInRateLimitResult`, and that is the point rather than a shortcut: there is no
 * message on either refusal, because the caller is told neither of them apart from a send. The
 * two refusals are named for the operator, who needs to tell an ordinary repeat from a campaign.
 * See `takeSignInAddress`.
 */
export type SignInAddressDecision = "send" | "over-caller-budget" | "over-address-ceiling";

export interface SignInRateLimiter {
  /** Counts one attempt and says whether it is within the limit. */
  take(ip: string | null, action: SignInAction, now?: number): SignInRateLimitResult;
  /**
   * Counts one invite request against the class and the caller together (#217). Only for a
   * request whose token has already resolved to `classId`; see `SIGN_IN_INVITE_LIMIT`.
   */
  takeInvite(ip: string | null, classId: string, now?: number): SignInRateLimitResult;
  /**
   * Counts one link against the caller and the address together, then against the address alone,
   * and says whether to send it. The caller's own budget is taken first, so a request this caller
   * has already spent cannot go on to spend the shared ceiling.
   */
  takeAddress(ip: string | null, email: string, now?: number): SignInAddressDecision;
  /**
   * How many times the address ceiling has refused since this process started, across every
   * address. The aggregate is the whole point: it says a campaign is running without saying who
   * against. For the log line in `app/sign-in/actions.ts`.
   */
  addressCeilingRefusals(): number;
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
  addressLimits: Readonly<
    Record<"perCaller" | "overall", Readonly<SignInLimit>>
  > = SIGN_IN_ADDRESS_LIMITS,
  inviteLimit: Readonly<SignInLimit> = SIGN_IN_INVITE_LIMIT,
): SignInRateLimiter {
  // All four counters share one Map, so there is one bound and one eviction policy to reason
  // about. The keys cannot collide: each carries a prefix the others do not use, and inside a
  // pair key neither half can hold the separator — `clientIp` has already checked that the
  // caller is an IP address or the one fixed word, a validated email has no `|` in it, and a
  // class id is a uuid the database just returned.
  const windows = new Map<string, CountedWindow>();
  let ceilingRefusals = 0;
  const longestWindow = Math.max(
    ...Object.values(addressLimits).map((limit) => limit.windowMs),
    ...Object.values(limits).map((limit) => limit.windowMs),
    inviteLimit.windowMs,
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
    takeInvite(ip, classId, now = Date.now()) {
      if (ip === null) return { ok: true };
      return within(`invite:${classId}|${ip}`, inviteLimit, now)
        ? { ok: true }
        : { ok: false, error: SIGN_IN_RATE_LIMITED };
    },
    takeAddress(ip, email, now = Date.now()) {
      const address = normalizeSignInAddress(email);
      // Off the platform there is no caller to key a pair on, so that tier drops out exactly as
      // `take` does, and for the same reason. The ceiling has no such exemption: the recipient is
      // known wherever the request came from.
      if (ip !== null && !within(`pair:${ip}|${address}`, addressLimits.perCaller, now)) {
        return "over-caller-budget";
      }
      if (!within(`address:${address}`, addressLimits.overall, now)) {
        ceilingRefusals += 1;
        return "over-address-ceiling";
      }
      return "send";
    },
    addressCeilingRefusals: () => ceilingRefusals,
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
 * Counts one class invite request from this request's address, in place of `takeSignInAttempt`,
 * once the invite token has resolved to `classId` (#217). The caller must not reach this with a
 * token that did not resolve: that request spends the per-IP email budget, as it always has.
 */
export function takeSignInInviteAttempt(
  requestHeaders: RequestHeaders,
  classId: string,
  limiter: SignInRateLimiter = sharedLimiter,
): SignInRateLimitResult {
  return limiter.takeInvite(clientIp(requestHeaders), classId);
}

/**
 * Counts one link against the address it would be sent to, and says whether to send it.
 *
 * The caller is read from the request headers by `clientIp`, the same way `takeSignInAttempt`
 * reads it, so the per-caller half of this inherits that function's argument about which headers
 * may be trusted and where, rather than inventing a second notion of who is asking.
 *
 * Anything but `"send"` means do not send — and, the part that matters, say nothing about it.
 * `SIGN_IN_RATE_LIMITED` tells a caller something about themselves: you have asked too often from
 * here. Nobody learns anything about anybody else from that, so saying it costs nothing and the
 * per-IP path says it. A refusal from either counter here is the opposite. Its answer turns on an
 * address the caller typed and may not own, so any distinguishable response — another message,
 * another status, another shape — is an oracle: ask once, watch the answer change, and you have
 * learned that this address is one the site sends to. Alongside `shouldCreateUser: false`, which
 * makes Supabase itself refuse an address that has no account, a visible refusal here would have
 * traded an email-flooding bug for an account-existence bug, which is the worse of the two. So
 * both refusals carry no message to show, and `app/sign-in/actions.ts` answers either one exactly
 * as it answers a link that really was sent. Which of the two it was goes to the log, never to
 * the caller, and without the address.
 */
export function takeSignInAddress(
  requestHeaders: RequestHeaders,
  email: string,
  limiter: SignInRateLimiter = sharedLimiter,
): SignInAddressDecision {
  return limiter.takeAddress(clientIp(requestHeaders), email);
}

/**
 * How many times the address ceiling has refused since this process started.
 *
 * Deliberately a total and nothing else. A rising number says somebody is being flooded from
 * several callers at once, which an operator should be able to see; naming the address would put
 * back the oracle that all of this exists to close.
 */
export function signInAddressCeilingRefusals(limiter: SignInRateLimiter = sharedLimiter): number {
  return limiter.addressCeilingRefusals();
}
