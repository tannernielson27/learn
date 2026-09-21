import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_ADDRESS_LIMIT,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  UNIDENTIFIED_CALLER,
  clientIp,
  createSignInRateLimiter,
  normalizeSignInAddress,
  takeSignInAddress,
  takeSignInAttempt,
} from "./signInRateLimit";

/** A request that came through Vercel, which is the only place the address headers are read. */
function request(headers: Record<string, string>): Headers {
  return new Headers({ "x-vercel-id": "iad1::abc123", ...headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("prefers the header Vercel sets itself", () => {
    const headers = request({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "198.51.100.4",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to x-forwarded-for", () => {
    expect(clientIp(request({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(request({ "x-forwarded-for": "198.51.100.5" }))).toBe("198.51.100.5");
  });

  it("takes the first hop of a multi-hop list", () => {
    const headers = request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("keeps an IPv6 address whole and lower-cased", () => {
    const headers = request({ "x-forwarded-for": "2001:DB8::8A2E:370:7334" });
    expect(clientIp(headers)).toBe("2001:db8::8a2e:370:7334");
  });

  it("refuses to make a bucket out of anything that is not an address", () => {
    // No caller gets to invent a key, however the header reached us.
    for (const junk of ["9".repeat(500), "not-an-ip", "203.0.113.7:8080", "  ,  ", ""]) {
      expect(clientIp(request({ "x-forwarded-for": junk }))).toBe(UNIDENTIFIED_CALLER);
    }
  });

  it("buckets a Vercel request with no address header under one shared key", () => {
    expect(clientIp(request({}))).toBe(UNIDENTIFIED_CALLER);
  });

  it("reads no address at all off the platform, however the headers look", () => {
    // Next's own server fills x-forwarded-for from the socket, so `next start` and the Playwright
    // auth run always carry one. Believing it would let the suite lock itself out, and off the
    // platform it would also let any caller name its own bucket.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "::1" });
    expect(clientIp(headers, false)).toBeNull();
    expect(clientIp(headers)).toBeNull();
  });

  it("treats the request as deployed when VERCEL is set, or when Vercel stamped it", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBeNull();
    expect(
      clientIp(new Headers({ "x-vercel-id": "iad1::abc", "x-forwarded-for": "203.0.113.7" })),
    ).toBe("203.0.113.7");
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
});

describe("createSignInRateLimiter", () => {
  const ip = "203.0.113.7";

  it("lets a normal sign-in through on both paths", () => {
    const limiter = createSignInRateLimiter();
    expect(limiter.take(ip, "email", 0)).toEqual({ ok: true });
    expect(limiter.take(ip, "demo", 0)).toEqual({ ok: true });
  });

  it("allows exactly the email limit in a window, then refuses", () => {
    const limiter = createSignInRateLimiter();
    const { attempts } = SIGN_IN_LIMITS.email;
    for (let call = 0; call < attempts; call += 1) {
      expect(limiter.take(ip, "email", call)).toEqual({ ok: true });
    }
    expect(limiter.take(ip, "email", attempts)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
  });

  it("allows exactly the demo limit in a window, then refuses", () => {
    const limiter = createSignInRateLimiter();
    const { attempts } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call < attempts; call += 1) {
      expect(limiter.take(ip, "demo", call)).toEqual({ ok: true });
    }
    expect(limiter.take(ip, "demo", attempts)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
  });

  it("says the same thing however the limit was reached, revealing nothing about an account", () => {
    expect(SIGN_IN_RATE_LIMITED).toBe(
      "Too many sign-in attempts from this network. Wait a few minutes, then try again.",
    );
    expect(SIGN_IN_RATE_LIMITED).not.toMatch(/account|email|password|exist/i);
  });

  it("spends the two paths' budgets separately", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 5; call += 1) {
      limiter.take(ip, "demo", call);
    }
    expect(limiter.take(ip, "demo", 0)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
    expect(limiter.take(ip, "email", 0)).toEqual({ ok: true });
  });

  it("counts each address on its own, so one heavy caller cannot lock out another", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 1; call += 1) {
      limiter.take(ip, "demo", call);
    }
    expect(limiter.take(ip, "demo", 0)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
    expect(limiter.take("198.51.100.4", "demo", 0)).toEqual({ ok: true });
  });

  it("starts a fresh window once the old one has run out", () => {
    const limiter = createSignInRateLimiter();
    const { attempts, windowMs } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call <= attempts; call += 1) limiter.take(ip, "demo", 0);
    expect(limiter.take(ip, "demo", windowMs - 1)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
    expect(limiter.take(ip, "demo", windowMs)).toEqual({ ok: true });
  });

  it("does not let hammering push the window out, so the wait never grows", () => {
    const limiter = createSignInRateLimiter();
    const { attempts, windowMs } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call < attempts + 200; call += 1) limiter.take(ip, "demo", call);
    // The window still ends one length after the first attempt, not after the last.
    expect(limiter.take(ip, "demo", windowMs)).toEqual({ ok: true });
  });

  it("does not limit a caller nothing identifies", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 10; call += 1) {
      expect(limiter.take(null, "demo", call)).toEqual({ ok: true });
    }
  });

  it("forgets windows that have run out", () => {
    const limiter = createSignInRateLimiter();
    for (let caller = 0; caller < 10_000; caller += 1) {
      limiter.take(`198.51.${Math.floor(caller / 250)}.${caller % 250}`, "email", 0);
    }
    expect(limiter.size()).toBe(10_000);
    // One more call after they have all run out sweeps them and leaves only the new one.
    limiter.take("203.0.113.7", "email", SIGN_IN_LIMITS.email.windowMs);
    expect(limiter.size()).toBe(1);
  });

  it("stays bounded under a flood, without handing anyone a clean slate", () => {
    const limiter = createSignInRateLimiter();
    const flood = (from: number, to: number, now: number) => {
      for (let caller = from; caller < to; caller += 1) {
        limiter.take(`198.51.${Math.floor(caller / 250)}.${caller % 250}`, "email", now);
      }
    };

    flood(0, 11_000, 0);
    // Someone reaches their limit while the flood is running.
    for (let call = 0; call <= SIGN_IN_LIMITS.demo.attempts; call += 1) {
      limiter.take("203.0.113.7", "demo", 1);
    }
    flood(11_000, 13_000, 2);

    expect(limiter.size()).toBeLessThanOrEqual(10_000);
    // Eviction takes the windows nearest their end first, so a live counter survives and the
    // flood buys nobody a fresh budget.
    expect(limiter.take("203.0.113.7", "demo", 3)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
  });
});

describe("takeSignInAttempt", () => {
  it("counts the attempt against the address the request came from", () => {
    const limiter = createSignInRateLimiter();
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts; call += 1) {
      expect(takeSignInAttempt(headers, "demo", limiter)).toEqual({ ok: true });
    }
    expect(takeSignInAttempt(headers, "demo", limiter)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
    // The email path still has its own budget, and another address is untouched.
    expect(takeSignInAttempt(headers, "email", limiter)).toEqual({ ok: true });
    expect(
      takeSignInAttempt(request({ "x-forwarded-for": "198.51.100.9" }), "demo", limiter),
    ).toEqual({ ok: true });
  });

  it("does not limit the same request off the platform", () => {
    const limiter = createSignInRateLimiter();
    const headers = new Headers({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 10; call += 1) {
      expect(takeSignInAttempt(headers, "demo", limiter)).toEqual({ ok: true });
    }
  });
});

describe("the chosen limits", () => {
  it("run in Supabase's own five-minute window", () => {
    expect(SIGN_IN_LIMITS.email.windowMs).toBe(5 * 60_000);
    expect(SIGN_IN_LIMITS.demo.windowMs).toBe(5 * 60_000);
  });

  it("keeps the shared demo account tighter than the emailed link", () => {
    expect(SIGN_IN_LIMITS.demo.attempts).toBeLessThan(SIGN_IN_LIMITS.email.attempts);
  });
});

describe("normalizeSignInAddress", () => {
  it("folds case and surrounding whitespace", () => {
    expect(normalizeSignInAddress("  Nurse@School.EDU ")).toBe("nurse@school.edu");
    expect(normalizeSignInAddress("nurse@school.edu")).toBe("nurse@school.edu");
  });

  it("stops there, and leaves provider conventions alone", () => {
    // Sub-addressing and Gmail's dots are conventions of particular mail servers, not rules about
    // mailboxes. Folding them would let a caller spend an address's budget without naming it.
    expect(normalizeSignInAddress("nurse+ngn@school.edu")).toBe("nurse+ngn@school.edu");
    expect(normalizeSignInAddress("n.urse@school.edu")).toBe("n.urse@school.edu");
  });
});

describe("the per-address counter", () => {
  const email = "nurse@school.edu";

  it("allows exactly the address limit in a window, then refuses", () => {
    const limiter = createSignInRateLimiter();
    const { attempts } = SIGN_IN_ADDRESS_LIMIT;
    for (let call = 0; call < attempts; call += 1) {
      expect(limiter.takeAddress(email, call)).toBe(true);
    }
    // A bare false, with no message to show: the caller is never told this happened.
    expect(limiter.takeAddress(email, attempts)).toBe(false);
  });

  it("gives one address one budget however it was spelled", () => {
    const limiter = createSignInRateLimiter();
    const spellings = ["Nurse@School.edu", " NURSE@SCHOOL.EDU ", "nurse@school.edu"];
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      expect(limiter.takeAddress(spellings[call % spellings.length], 0)).toBe(true);
    }
    expect(limiter.takeAddress("nUrSe@school.EDU", 0)).toBe(false);
  });

  it("keeps the recipient's budget apart from the callers' and from other recipients'", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call <= SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      limiter.takeAddress(email, 0);
    }
    expect(limiter.takeAddress(email, 0)).toBe(false);
    expect(limiter.take("203.0.113.7", "email", 0)).toEqual({ ok: true });
    expect(limiter.takeAddress("charge@school.edu", 0)).toBe(true);
  });

  it("starts a fresh window once the old one has run out", () => {
    const limiter = createSignInRateLimiter();
    const { attempts, windowMs } = SIGN_IN_ADDRESS_LIMIT;
    for (let call = 0; call <= attempts; call += 1) limiter.takeAddress(email, 0);
    expect(limiter.takeAddress(email, windowMs - 1)).toBe(false);
    expect(limiter.takeAddress(email, windowMs)).toBe(true);
  });

  it("counts the recipient even where the caller is not counted at all", () => {
    // `take` opts out when nothing identifies the caller. The recipient is known either way, so
    // this counter has no such exemption.
    const limiter = createSignInRateLimiter();
    for (let call = 0; call <= SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      expect(limiter.take(null, "email", call)).toEqual({ ok: true });
    }
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      expect(limiter.takeAddress(email, call)).toBe(true);
    }
    expect(limiter.takeAddress(email, SIGN_IN_ADDRESS_LIMIT.attempts)).toBe(false);
  });
});

describe("takeSignInAddress", () => {
  it("counts one link against the address it would be mailed to", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      expect(takeSignInAddress("nurse@school.edu", limiter)).toBe(true);
    }
    expect(takeSignInAddress("nurse@school.edu", limiter)).toBe(false);
  });
});

describe("the chosen per-address limit", () => {
  it("runs in the same five-minute window as the rest", () => {
    expect(SIGN_IN_ADDRESS_LIMIT.windowMs).toBe(5 * 60_000);
  });

  it("holds one inbox far tighter than one network", () => {
    // One address is one person; one IP can be a whole class. See the comment on the constant.
    expect(SIGN_IN_ADDRESS_LIMIT.attempts).toBe(3);
    expect(SIGN_IN_ADDRESS_LIMIT.attempts).toBeLessThan(SIGN_IN_LIMITS.email.attempts);
  });
});
