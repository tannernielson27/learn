import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_ADDRESS_LIMITS,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  SIGN_IN_UNAVAILABLE,
  type SignInRateLimiter,
  UNIDENTIFIED_CALLER,
  clientIp,
  createSignInRateLimiter,
  normalizeSignInAddress,
  signInAddressCeilingRefusals,
  takeSignInAddress,
  takeSignInAttempt,
} from "./signInRateLimit";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";

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

/** A limiter on the in-memory fake, with a clock the test moves. */
function setup() {
  const clock = { at: 0 };
  const store = createMemoryRateLimitStore({ now: () => clock.at });
  return { clock, store, limiter: createSignInRateLimiter(store) };
}

const REFUSED = { ok: false, error: SIGN_IN_RATE_LIMITED };

describe("createSignInRateLimiter", () => {
  const ip = "203.0.113.7";

  it("lets a normal sign-in through on both paths", async () => {
    const { limiter } = setup();
    expect(await limiter.take(ip, "email")).toEqual({ ok: true });
    expect(await limiter.take(ip, "demo")).toEqual({ ok: true });
  });

  it("allows exactly the email limit in a window, then refuses", async () => {
    const { limiter } = setup();
    const { attempts } = SIGN_IN_LIMITS.email;
    for (let call = 0; call < attempts; call += 1) {
      expect(await limiter.take(ip, "email")).toEqual({ ok: true });
    }
    expect(await limiter.take(ip, "email")).toEqual(REFUSED);
  });

  it("allows exactly the demo limit in a window, then refuses", async () => {
    const { limiter } = setup();
    const { attempts } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call < attempts; call += 1) {
      expect(await limiter.take(ip, "demo")).toEqual({ ok: true });
    }
    expect(await limiter.take(ip, "demo")).toEqual(REFUSED);
  });

  it("says the same thing however the limit was reached, revealing nothing about an account", () => {
    expect(SIGN_IN_RATE_LIMITED).toBe(
      "Too many sign-in attempts from this network. Wait a few minutes, then try again.",
    );
    expect(SIGN_IN_RATE_LIMITED).not.toMatch(/account|email|password|exist/i);
    expect(SIGN_IN_UNAVAILABLE).not.toMatch(/account|email|password|exist/i);
  });

  it("spends the two paths' budgets separately", async () => {
    const { limiter } = setup();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 5; call += 1) {
      await limiter.take(ip, "demo");
    }
    expect(await limiter.take(ip, "demo")).toEqual(REFUSED);
    expect(await limiter.take(ip, "email")).toEqual({ ok: true });
  });

  it("counts each address on its own, so one heavy caller cannot lock out another", async () => {
    const { limiter } = setup();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 1; call += 1) {
      await limiter.take(ip, "demo");
    }
    expect(await limiter.take(ip, "demo")).toEqual(REFUSED);
    expect(await limiter.take("198.51.100.4", "demo")).toEqual({ ok: true });
  });

  it("starts a fresh window once the old one has run out", async () => {
    const { limiter, clock } = setup();
    const { attempts, windowMs } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call <= attempts; call += 1) await limiter.take(ip, "demo");
    clock.at = windowMs - 1;
    expect(await limiter.take(ip, "demo")).toEqual(REFUSED);
    clock.at = windowMs;
    expect(await limiter.take(ip, "demo")).toEqual({ ok: true });
  });

  it("does not let hammering push the window out, so the wait never grows", async () => {
    const { limiter, clock } = setup();
    const { attempts, windowMs } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call < attempts + 200; call += 1) {
      clock.at = call;
      await limiter.take(ip, "demo");
    }
    // The window still ends one length after the first attempt, not after the last.
    clock.at = windowMs;
    expect(await limiter.take(ip, "demo")).toEqual({ ok: true });
  });

  it("does not limit a caller nothing identifies, and does not even ask the store", async () => {
    const { limiter, store } = setup();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 10; call += 1) {
      expect(await limiter.take(null, "demo")).toEqual({ ok: true });
    }
    expect(store.hits()).toEqual([]);
  });

  it("counts in the bucket each path names", async () => {
    const { limiter, store } = setup();
    await limiter.take(ip, "email");
    await limiter.take(ip, "demo");
    expect(store.hits()).toEqual([
      { bucket: "sign_in_email", key: ip },
      { bucket: "sign_in_demo", key: ip },
    ]);
  });
});

describe("when the shared store cannot answer (#234)", () => {
  const ip = "203.0.113.7";
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    logged.mockClear();
  });

  it("refuses sign-in on both paths, saying the site is having trouble", async () => {
    const { limiter, store } = setup();
    store.failWith(new RateLimitUnavailableError("PGRST301"));
    const unavailable = { ok: false, error: SIGN_IN_UNAVAILABLE };
    expect(await limiter.take(ip, "email")).toEqual(unavailable);
    expect(await limiter.take(ip, "demo")).toEqual(unavailable);
    expect(await limiter.takeInvite(ip, "00000000-0000-4000-8000-0000000000a1")).toEqual(
      unavailable,
    );
  });

  it("does not send a link, and answers it as it answers every refusal: silently", async () => {
    const { limiter, store } = setup();
    store.failWith(new RateLimitUnavailableError("PGRST301"));
    expect(await limiter.takeAddress(ip, "nurse@school.edu")).toBe("unchecked");
    expect(await limiter.takeAddress(null, "nurse@school.edu")).toBe("unchecked");
  });

  it("logs the failure without the caller or the address", async () => {
    const { limiter, store } = setup();
    store.failWith(new RateLimitUnavailableError("PGRST301"));
    await limiter.take(ip, "email");
    await limiter.takeAddress(ip, "nurse@school.edu");
    expect(logged).toHaveBeenCalledTimes(2);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).toContain("PGRST301");
    expect(text).not.toContain(ip);
    expect(text).not.toContain("nurse");
  });

  it("logs something useful even when the failure is not an Error", async () => {
    const { limiter, store } = setup();
    store.failWith("socket closed" as unknown as Error);
    expect(await limiter.take(ip, "email")).toEqual({ ok: false, error: SIGN_IN_UNAVAILABLE });
    expect(JSON.stringify(logged.mock.calls)).toContain("unknown");
  });
});

describe("takeSignInAttempt", () => {
  it("counts the attempt against the address the request came from", async () => {
    const { limiter } = setup();
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts; call += 1) {
      expect(await takeSignInAttempt(headers, "demo", limiter)).toEqual({ ok: true });
    }
    expect(await takeSignInAttempt(headers, "demo", limiter)).toEqual(REFUSED);
    // The email path still has its own budget, and another address is untouched.
    expect(await takeSignInAttempt(headers, "email", limiter)).toEqual({ ok: true });
    expect(
      await takeSignInAttempt(request({ "x-forwarded-for": "198.51.100.9" }), "demo", limiter),
    ).toEqual({ ok: true });
  });

  it("does not limit the same request off the platform", async () => {
    const { limiter } = setup();
    const headers = new Headers({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 10; call += 1) {
      expect(await takeSignInAttempt(headers, "demo", limiter)).toEqual({ ok: true });
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

  it("allows exactly the budget in a window, then refuses that caller", async () => {
    const { limiter } = setup();
    for (let call = 0; call < perCaller.attempts; call += 1) {
      expect(await limiter.takeAddress(ip, email)).toBe("send");
    }
    expect(await limiter.takeAddress(ip, email)).toBe("over-caller-budget");
  });

  it("refuses only the caller that spent it, which is the whole point of the pair key", async () => {
    // The shape that makes this not a lockout: one caller hammering an address cannot stop its
    // owner, or anyone else, from asking for a link.
    const { limiter } = setup();
    for (let call = 0; call <= perCaller.attempts; call += 1) await limiter.takeAddress(ip, email);
    expect(await limiter.takeAddress(ip, email)).toBe("over-caller-budget");
    expect(await limiter.takeAddress("198.51.100.4", email)).toBe("send");
  });

  it("does not let a refused caller go on to spend the shared ceiling", async () => {
    const { limiter } = setup();
    // Far more asks than the ceiling, all from one caller: the ceiling must survive them.
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts * 5; call += 1) {
      await limiter.takeAddress(ip, email);
    }
    expect(await limiter.takeAddress("198.51.100.4", email)).toBe("send");
    expect(limiter.addressCeilingRefusals()).toBe(0);
  });

  it("gives one caller and address one budget however the address was spelled", async () => {
    const { limiter } = setup();
    const spellings = ["Nurse@School.edu", " NURSE@SCHOOL.EDU ", "nurse@school.edu"];
    for (let call = 0; call < perCaller.attempts; call += 1) {
      expect(await limiter.takeAddress(ip, spellings[call % spellings.length])).toBe("send");
    }
    expect(await limiter.takeAddress(ip, "nUrSe@school.EDU")).toBe("over-caller-budget");
  });

  it("keeps each address, and the sign-in paths, on their own counters", async () => {
    const { limiter } = setup();
    for (let call = 0; call <= perCaller.attempts; call += 1) await limiter.takeAddress(ip, email);
    expect(await limiter.takeAddress(ip, email)).toBe("over-caller-budget");
    expect(await limiter.takeAddress(ip, "charge@school.edu")).toBe("send");
    expect(await limiter.take(ip, "email")).toEqual({ ok: true });
  });

  it("starts a fresh window once the old one has run out", async () => {
    const { limiter, clock } = setup();
    for (let call = 0; call <= perCaller.attempts; call += 1) await limiter.takeAddress(ip, email);
    clock.at = perCaller.windowMs - 1;
    expect(await limiter.takeAddress(ip, email)).toBe("over-caller-budget");
    clock.at = perCaller.windowMs;
    expect(await limiter.takeAddress(ip, email)).toBe("send");
  });

  it("drops out where nothing identifies the caller, leaving only the ceiling", async () => {
    // `take` opts out off the platform for the reasons in `clientIp`; the pair key cannot exist
    // without a caller, so it opts out with it. The ceiling has no such exemption.
    const { limiter } = setup();
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts; call += 1) {
      expect(await limiter.takeAddress(null, email)).toBe("send");
    }
    expect(await limiter.takeAddress(null, email)).toBe("over-address-ceiling");
  });

  it("hands the store the normalised address, in the pair and the ceiling buckets", async () => {
    const { limiter, store } = setup();
    await limiter.takeAddress(ip, " Nurse@School.EDU ");
    expect(store.hits()).toEqual([
      { bucket: "sign_in_address_pair", key: `${ip}|${email}` },
      { bucket: "sign_in_address", key: email },
    ]);
  });
});

describe("the deployment-wide address ceiling", () => {
  const email = "nurse@school.edu";
  const { perCaller, overall } = SIGN_IN_ADDRESS_LIMITS;

  /** Spends the ceiling the only way a caller can: a fresh caller every `perCaller` asks. */
  async function floodFromManyCallers(limiter: SignInRateLimiter, to: string) {
    for (let call = 0; call < overall.attempts; call += 1) {
      const caller = `198.51.100.${Math.floor(call / perCaller.attempts)}`;
      expect(await limiter.takeAddress(caller, to)).toBe("send");
    }
  }

  it("holds when the asks are spread across callers, which is what #139 asked for", async () => {
    const { limiter } = setup();
    await floodFromManyCallers(limiter, email);
    expect(await limiter.takeAddress("203.0.113.7", email)).toBe("over-address-ceiling");
  });

  it("holds across server instances, because the count lives in the shared store", async () => {
    // Two instances: two limiters, one store. The in-memory limiter this replaced gave each
    // instance its own ceiling.
    const { store } = setup();
    const first = createSignInRateLimiter(store);
    const second = createSignInRateLimiter(store);
    await floodFromManyCallers(first, email);
    expect(await second.takeAddress("203.0.113.7", email)).toBe("over-address-ceiling");
  });

  it("counts its refusals in the aggregate, and says nothing about which address", async () => {
    const { limiter } = setup();
    expect(limiter.addressCeilingRefusals()).toBe(0);
    await floodFromManyCallers(limiter, email);
    await limiter.takeAddress("203.0.113.7", email);
    await limiter.takeAddress("203.0.113.8", email);
    expect(limiter.addressCeilingRefusals()).toBe(2);
  });

  it("leaves other addresses alone, so a campaign is not a site-wide outage", async () => {
    const { limiter } = setup();
    await floodFromManyCallers(limiter, email);
    expect(await limiter.takeAddress("203.0.113.7", email)).toBe("over-address-ceiling");
    expect(await limiter.takeAddress("203.0.113.7", "charge@school.edu")).toBe("send");
  });

  it("starts a fresh window once the old one has run out", async () => {
    const { limiter, clock } = setup();
    await floodFromManyCallers(limiter, email);
    clock.at = overall.windowMs - 1;
    expect(await limiter.takeAddress("203.0.113.7", email)).toBe("over-address-ceiling");
    clock.at = overall.windowMs;
    expect(await limiter.takeAddress("203.0.113.7", email)).toBe("send");
  });
});

describe("takeSignInAddress", () => {
  it("counts against the caller the request headers name, the way takeSignInAttempt does", async () => {
    const { limiter } = setup();
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; call += 1) {
      expect(await takeSignInAddress(headers, "nurse@school.edu", limiter)).toBe("send");
    }
    expect(await takeSignInAddress(headers, "nurse@school.edu", limiter)).toBe(
      "over-caller-budget",
    );
    // Another caller, same address: refused callers do not refuse anybody else.
    const elsewhere = request({ "x-forwarded-for": "198.51.100.9" });
    expect(await takeSignInAddress(elsewhere, "nurse@school.edu", limiter)).toBe("send");
  });

  it("reads no caller off the platform, so only the ceiling applies", async () => {
    const { limiter } = setup();
    const headers = new Headers({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts + 1; call += 1) {
      expect(await takeSignInAddress(headers, "nurse@school.edu", limiter)).toBe("send");
    }
  });
});

describe("signInAddressCeilingRefusals", () => {
  it("reports the running total the log line carries", async () => {
    const { limiter } = setup();
    expect(signInAddressCeilingRefusals(limiter)).toBe(0);
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts + 1; call += 1) {
      await takeSignInAddress(new Headers(), "nurse@school.edu", limiter);
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
