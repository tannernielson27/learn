import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTCHA_FAILED,
  CAPTCHA_REQUIRED,
  CAPTCHA_UNAVAILABLE,
  CAPTCHA_VERIFY_URL,
  captchaMode,
  captchaTokenFrom,
  verifyCaptcha,
  type CaptchaEnv,
} from "./captcha";
import { CAPTCHA_FIELD_NAME, captchaSiteKey } from "./turnstile";

const SITE_KEY = "0x4AAAAAAA-site";
const SECRET = "0x4AAAAAAA-secret-value";
const KEYS: CaptchaEnv = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY,
  TURNSTILE_SECRET_KEY: SECRET,
};
const ON_VERCEL = new Headers({ "x-vercel-id": "iad1::abc", "x-real-ip": "203.0.113.7" });
const LOCAL = new Headers();

const answer = (body: unknown, status = 200) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );

const sentBody = (fetchImpl: ReturnType<typeof answer>): URLSearchParams =>
  fetchImpl.mock.calls[0]![1]!.body as URLSearchParams;

afterEach(() => vi.restoreAllMocks());

function quiet() {
  return {
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  };
}

describe("captchaMode (#359)", () => {
  it("is off with neither key, on with both", () => {
    expect(captchaMode({})).toBe("off");
    expect(captchaMode({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: " ", TURNSTILE_SECRET_KEY: "" })).toBe(
      "off",
    );
    expect(captchaMode(KEYS)).toBe("on");
  });

  it("is misconfigured with one key and not the other", () => {
    expect(captchaMode({ TURNSTILE_SECRET_KEY: SECRET })).toBe("misconfigured");
    expect(captchaMode({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY })).toBe("misconfigured");
  });

  it("is misconfigured when the secret was also given a NEXT_PUBLIC_ name", () => {
    expect(captchaMode({ ...KEYS, NEXT_PUBLIC_TURNSTILE_SECRET_KEY: SECRET })).toBe(
      "misconfigured",
    );
  });
});

describe("verifyCaptcha (#359)", () => {
  it("skips the check, and calls nobody, when both keys are unset", async () => {
    const fetchImpl = answer({ success: true });
    expect(await verifyCaptcha(null, LOCAL, { env: {}, fetch: fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses on a production deployment with both keys unset, and names them in the log", async () => {
    const { error } = quiet();
    const env = { VERCEL_ENV: "production" };
    const fetchImpl = answer({ success: true });
    expect(await verifyCaptcha("a-token", LOCAL, { env, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_UNAVAILABLE,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain("TURNSTILE_SECRET_KEY");
  });

  it("still skips the check on a preview deployment with both keys unset", async () => {
    const env = { VERCEL_ENV: "preview" };
    expect(await verifyCaptcha(null, LOCAL, { env, fetch: answer({}) })).toEqual({ ok: true });
  });

  it("passes a good token, posting the secret, the token and the caller to Cloudflare", async () => {
    const fetchImpl = answer({ success: true, "error-codes": [], hostname: "learn.example" });
    const result = await verifyCaptcha("good-token", ON_VERCEL, { env: KEYS, fetch: fetchImpl });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(CAPTCHA_VERIFY_URL);
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    const body = sentBody(fetchImpl);
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("good-token");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("leaves the caller's address out when the request did not come through Vercel", async () => {
    const fetchImpl = answer({ success: true });
    await verifyCaptcha("good-token", LOCAL, { env: KEYS, fetch: fetchImpl });
    expect(sentBody(fetchImpl).has("remoteip")).toBe(false);
  });

  it.each([null, undefined, "", "   "])("refuses a missing token (%j) unasked", async (token) => {
    const fetchImpl = answer({ success: true });
    expect(await verifyCaptcha(token, ON_VERCEL, { env: KEYS, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_REQUIRED,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a token longer than Cloudflare issues, unasked", async () => {
    const fetchImpl = answer({ success: true });
    const result = await verifyCaptcha("x".repeat(2049), ON_VERCEL, {
      env: KEYS,
      fetch: fetchImpl,
    });
    expect(result).toEqual({ ok: false, error: CAPTCHA_FAILED });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["invalid-input-response", "timeout-or-duplicate"])(
    "refuses a token Cloudflare rejects (%s)",
    async (code) => {
      quiet();
      const fetchImpl = answer({ success: false, "error-codes": [code] });
      expect(await verifyCaptcha("bad", ON_VERCEL, { env: KEYS, fetch: fetchImpl })).toEqual({
        ok: false,
        error: CAPTCHA_FAILED,
      });
    },
  );

  it("refuses anything but a literal true", async () => {
    quiet();
    for (const body of [{ success: "true" }, { success: 1 }, {}, null, [], "ok"]) {
      const result = await verifyCaptcha("t", ON_VERCEL, { env: KEYS, fetch: answer(body) });
      expect(result.ok).toBe(false);
    }
  });

  it("fails closed, as the site's own trouble, when Cloudflare blames the secret", async () => {
    const { error } = quiet();
    const fetchImpl = answer({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await verifyCaptcha("t", ON_VERCEL, { env: KEYS, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_UNAVAILABLE,
    });
    expect(error).toHaveBeenCalled();
  });

  it("fails closed when the verifier cannot be reached", async () => {
    quiet();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyCaptcha("t", ON_VERCEL, { env: KEYS, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_UNAVAILABLE,
    });
  });

  it("fails closed when the verifier answers with an error status, even one saying success", async () => {
    quiet();
    const fetchImpl = answer({ success: true }, 500);
    expect(await verifyCaptcha("t", ON_VERCEL, { env: KEYS, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_UNAVAILABLE,
    });
  });

  it("fails closed when the verifier's answer is not JSON", async () => {
    quiet();
    const fetchImpl = vi.fn(async () => new Response("<html>busy</html>", { status: 200 }));
    expect(await verifyCaptcha("t", ON_VERCEL, { env: KEYS, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_UNAVAILABLE,
    });
  });

  it("gives up on a verifier that does not answer in time", async () => {
    quiet();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        }),
    );
    const result = await verifyCaptcha("t", ON_VERCEL, {
      env: KEYS,
      fetch: fetchImpl,
      timeoutMs: 10,
    });
    expect(result).toEqual({ ok: false, error: CAPTCHA_UNAVAILABLE });
  });

  it.each([
    ["the secret alone", { TURNSTILE_SECRET_KEY: SECRET }, "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
    ["the site key alone", { NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY }, "TURNSTILE_SECRET_KEY"],
    [
      "a public copy of the secret",
      { ...KEYS, NEXT_PUBLIC_TURNSTILE_SECRET_KEY: SECRET },
      "NEXT_PUBLIC_TURNSTILE_SECRET_KEY",
    ],
  ])("refuses every request, unasked, with %s set", async (_name, env, named) => {
    const { error } = quiet();
    const fetchImpl = answer({ success: true });
    expect(await verifyCaptcha("good-token", ON_VERCEL, { env, fetch: fetchImpl })).toEqual({
      ok: false,
      error: CAPTCHA_UNAVAILABLE,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]![0])).toContain(named);
  });

  it("checks the action when the caller names one", async () => {
    quiet();
    const fetchImpl = answer({ success: true, action: "sign-in" });
    const options = { env: KEYS, fetch: fetchImpl, action: "sign-up" };
    expect(await verifyCaptcha("t", ON_VERCEL, options)).toEqual({
      ok: false,
      error: CAPTCHA_FAILED,
    });
    const matching = { ...options, fetch: answer({ success: true, action: "sign-up" }) };
    expect(await verifyCaptcha("t", ON_VERCEL, matching)).toEqual({ ok: true });
  });

  it("never logs the secret or the token", async () => {
    const { error, warn } = quiet();
    await verifyCaptcha("the-token-value", ON_VERCEL, {
      env: KEYS,
      fetch: answer({ success: false, "error-codes": ["invalid-input-response", SECRET] }),
    });
    await verifyCaptcha("the-token-value", ON_VERCEL, {
      env: KEYS,
      fetch: vi.fn(async () => {
        throw new Error(`could not post ${SECRET}`);
      }),
    });
    const logged = JSON.stringify([...error.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("the-token-value");
  });
});

describe("captchaTokenFrom (#359)", () => {
  it("reads the widget's field from a form, and nothing but a string", () => {
    const form = new FormData();
    expect(captchaTokenFrom(form)).toBeNull();
    form.set(CAPTCHA_FIELD_NAME, "token-1");
    expect(captchaTokenFrom(form)).toBe("token-1");
    const withFile = new FormData();
    withFile.set(CAPTCHA_FIELD_NAME, new Blob(["x"]));
    expect(captchaTokenFrom(withFile)).toBeNull();
  });
});

describe("captchaSiteKey (#359)", () => {
  it("is the trimmed public key, or null", () => {
    expect(captchaSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: ` ${SITE_KEY} ` })).toBe(SITE_KEY);
    expect(captchaSiteKey({})).toBeNull();
    expect(captchaSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "  " })).toBeNull();
  });
});
