import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_ADDRESS_LIMITS,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  UNIDENTIFIED_CALLER,
  clientIp,
  createSignInRateLimiter,
  normalizeSignInAddress,
  signInAddressCeilingRefusals,
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

describe("the per-caller-and-address budget", () => {
  const email = "nurse@school.edu";
  const ip = "203.0.113.7";
  const { perCaller } = SIGN_IN_ADDRESS_LIMITS;

  it("allows exactly the budget in a window, then refuses that caller", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < perCaller.attempts; call += 1) {
      expect(limiter.takeAddress(ip, email, call)).toBe("send");
    }
    expect(limiter.takeAddress(ip, email, perCaller.attempts)).toBe("over-caller-budget");
  });

  it("refuses only the caller that spent it, which is the whole point of the pair key", () => {
    // The shape that makes this not a lockout: one caller hammering an address cannot stop its
    // owner, or anyone else, from asking for a link.
    const limiter = createSignInRateLimiter();
    for (let call = 0; call <= perCaller.attempts; call += 1) limiter.takeAddress(ip, email, 0);
    expect(limiter.takeAddress(ip, email, 0)).toBe("over-caller-budget");
    expect(limiter.takeAddress("198.51.100.4", email, 0)).toBe("send");
  });

  it("does not let a refused caller go on to spend the shared ceiling", () => {
    const limiter = createSignInRateLimiter();
    // Far more asks than the ceiling, all from one caller: the ceiling must survive them.
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts * 5; call += 1) {
      limiter.takeAddress(ip, email, 0);
    }
    expect(limiter.takeAddress("198.51.100.4", email, 0)).toBe("send");
    expect(limiter.addressCeilingRefusals()).toBe(0);
  });

  it("gives one caller and address one budget however the address was spelled", () => {
    const limiter = createSignInRateLimiter();
    const spellings = ["Nurse@School.edu", " NURSE@SCHOOL.EDU ", "nurse@school.edu"];
    for (let call = 0; call < perCaller.attempts; call += 1) {
      expect(limiter.takeAddress(ip, spellings[call % spellings.length], 0)).toBe("send");
    }
    expect(limiter.takeAddress(ip, "nUrSe@school.EDU", 0)).toBe("over-caller-budget");
  });

  it("keeps each address, and the sign-in paths, on their own counters", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call <= perCaller.attempts; call += 1) limiter.takeAddress(ip, email, 0);
    expect(limiter.takeAddress(ip, email, 0)).toBe("over-caller-budget");
    expect(limiter.takeAddress(ip, "charge@school.edu", 0)).toBe("send");
    expect(limiter.take(ip, "email", 0)).toEqual({ ok: true });
  });

  it("starts a fresh window once the old one has run out", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call <= perCaller.attempts; call += 1) limiter.takeAddress(ip, email, 0);
    expect(limiter.takeAddress(ip, email, perCaller.windowMs - 1)).toBe("over-caller-budget");
    expect(limiter.takeAddress(ip, email, perCaller.windowMs)).toBe("send");
  });

  it("drops out where nothing identifies the caller, leaving only the ceiling", () => {
    // `take` opts out off the platform for the reasons in `clientIp`; the pair key cannot exist
    // without a caller, so it opts out with it. The ceiling has no such exemption.
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts; call += 1) {
      expect(limiter.takeAddress(null, email, call)).toBe("send");
    }
    expect(limiter.takeAddress(null, email, 0)).toBe("over-address-ceiling");
  });
});

describe("the deployment-wide address ceiling", () => {
  const email = "nurse@school.edu";
  const { perCaller, overall } = SIGN_IN_ADDRESS_LIMITS;

  /** Spends the ceiling the only way a caller can: a fresh caller every `perCaller` asks. */
  function floodFromManyCallers(limiter: ReturnType<typeof createSignInRateLimiter>, to: string) {
    for (let call = 0; call < overall.attempts; call += 1) {
      const caller = `198.51.100.${Math.floor(call / perCaller.attempts)}`;
      expect(limiter.takeAddress(caller, to, 0)).toBe("send");
    }
  }

  it("holds when the asks are spread across callers, which is what #139 asked for", () => {
    const limiter = createSignInRateLimiter();
    floodFromManyCallers(limiter, email);
    expect(limiter.takeAddress("203.0.113.7", email, 0)).toBe("over-address-ceiling");
  });

  it("counts its refusals in the aggregate, and says nothing about which address", () => {
    const limiter = createSignInRateLimiter();
    expect(limiter.addressCeilingRefusals()).toBe(0);
    floodFromManyCallers(limiter, email);
    limiter.takeAddress("203.0.113.7", email, 0);
    limiter.takeAddress("203.0.113.8", email, 0);
    expect(limiter.addressCeilingRefusals()).toBe(2);
  });

  it("leaves other addresses alone, so a campaign is not a site-wide outage", () => {
    const limiter = createSignInRateLimiter();
    floodFromManyCallers(limiter, email);
    expect(limiter.takeAddress("203.0.113.7", email, 0)).toBe("over-address-ceiling");
    expect(limiter.takeAddress("203.0.113.7", "charge@school.edu", 0)).toBe("send");
  });

  it("starts a fresh window once the old one has run out", () => {
    const limiter = createSignInRateLimiter();
    floodFromManyCallers(limiter, email);
    expect(limiter.takeAddress("203.0.113.7", email, overall.windowMs - 1)).toBe(
      "over-address-ceiling",
    );
    expect(limiter.takeAddress("203.0.113.7", email, overall.windowMs)).toBe("send");
  });
});

describe("takeSignInAddress", () => {
  it("counts against the caller the request headers name, the way takeSignInAttempt does", () => {
    const limiter = createSignInRateLimiter();
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; call += 1) {
      expect(takeSignInAddress(headers, "nurse@school.edu", limiter)).toBe("send");
    }
    expect(takeSignInAddress(headers, "nurse@school.edu", limiter)).toBe("over-caller-budget");
    // Another caller, same address: refused callers do not refuse anybody else.
    const elsewhere = request({ "x-forwarded-for": "198.51.100.9" });
    expect(takeSignInAddress(elsewhere, "nurse@school.edu", limiter)).toBe("send");
  });

  it("reads no caller off the platform, so only the ceiling applies", () => {
    const limiter = createSignInRateLimiter();
    const headers = new Headers({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts + 1; call += 1) {
      expect(takeSignInAddress(headers, "nurse@school.edu", limiter)).toBe("send");
    }
  });
});

describe("signInAddressCeilingRefusals", () => {
  it("reports the running total the log line carries", () => {
    const limiter = createSignInRateLimiter();
    expect(signInAddressCeilingRefusals(limiter)).toBe(0);
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts + 1; call += 1) {
      takeSignInAddress(new Headers(), "nurse@school.edu", limiter);
    }
    expect(signInAddressCeilingRefusals(limiter)).toBe(1);
  });
});

describe("the chosen recipient limits", () => {
  it("run in the same five-minute window as the rest", () => {
    expect(SIGN_IN_ADDRESS_LIMITS.perCaller.windowMs).toBe(5 * 60_000);
    expect(SIGN_IN_ADDRESS_LIMITS.overall.windowMs).toBe(5 * 60_000);
  });

  it("read in order: tightest per caller and address, then per address, then per caller", () => {
    // 3 < 12 < 30. The ordering is the design: one caller hammering one address meets the first,
    // a flood on one address meets the second, and the third still bounds one caller in total.
    expect(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts).toBe(3);
    expect(SIGN_IN_ADDRESS_LIMITS.overall.attempts).toBe(12);
    expect(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts).toBeLessThan(
      SIGN_IN_ADDRESS_LIMITS.overall.attempts,
    );
    expect(SIGN_IN_ADDRESS_LIMITS.overall.attempts).toBeLessThan(SIGN_IN_LIMITS.email.attempts);
  });

  it("leaves a real person room for several networks before the silent ceiling", () => {
    // Somebody refused by the ceiling is refused without being told, so the headroom above one
    // person's handful of attempts is the thing that keeps them from being collateral damage.
    expect(SIGN_IN_ADDRESS_LIMITS.overall.attempts).toBeGreaterThanOrEqual(
      SIGN_IN_ADDRESS_LIMITS.perCaller.attempts * 4,
    );
  });
});
