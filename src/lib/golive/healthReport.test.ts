import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseMemo,
  deployedVersion,
  handleHealth,
  summarizeEnv,
  type HealthDeps,
} from "./healthReport";
import { REQUIRED_ENV } from "./envVars";

const TOKEN = "t".repeat(64);

const FULL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_known",
  SUPABASE_SECRET_KEY: "sb_secret_known",
  SUPABASE_JWT_SIGNING_KEY: "jwt-known",
  RESEND_API_KEY: "re_known",
  EMAIL_FROM: "LeaRN <learn@example.test>",
  CRON_SECRET: TOKEN,
  SENTRY_DSN: "https://k@o1.ingest.us.sentry.io/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.us.sentry.io/1",
  VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
};

function deps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  return {
    env: FULL_ENV,
    supabase: async () => ({ status: "ok", project: "abcdefghijklmnopqrst" }),
    ...overrides,
  };
}

const get = (headers: Record<string, string> = {}) =>
  new Request("https://learn.example/api/health", { headers });

describe("summarizeEnv", () => {
  it("reports every required variable as a boolean and the demo account as off", () => {
    const summary = summarizeEnv(FULL_ENV);
    expect(Object.keys(summary.env).sort()).toEqual(REQUIRED_ENV.map((v) => v.name).sort());
    expect(Object.values(summary.env).every((present) => present === true)).toBe(true);
    expect(summary.demoAccount).toBe(false);
  });

  it("treats blank values as missing and a short CRON_SECRET as missing", () => {
    const summary = summarizeEnv({ ...FULL_ENV, RESEND_API_KEY: "  ", CRON_SECRET: "short" });
    expect(summary.env.RESEND_API_KEY).toBe(false);
    expect(summary.env.CRON_SECRET).toBe(false);
    expect(summary.env.EMAIL_FROM).toBe(true);
  });

  it("counts the demo account as on when either of its variables is set", () => {
    expect(summarizeEnv({ ...FULL_ENV, DEMO_ACCOUNT_EMAIL: "demo@x.test" }).demoAccount).toBe(true);
    expect(summarizeEnv({ ...FULL_ENV, DEMO_ACCOUNT_PASSWORD: "p" }).demoAccount).toBe(true);
  });
});

describe("deployedVersion", () => {
  it("shortens a commit SHA to 12 characters", () => {
    expect(deployedVersion("0123456789ABCDEF0123456789abcdef01234567")).toBe("0123456789ab");
  });

  it("says local when unset and unknown for anything that is not a SHA, never echoing it", () => {
    expect(deployedVersion(undefined)).toBe("local");
    expect(deployedVersion("")).toBe("local");
    expect(deployedVersion("not-a-sha re_secret")).toBe("unknown");
  });
});

describe("handleHealth", () => {
  it("gives anyone the overall answer only, briefly cacheable", async () => {
    const response = await handleHealth(get(), deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=5, s-maxage=5");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(await response.json()).toEqual({
      supabase: "ok",
      project: "abcdefghijklmnopqrst",
      version: "0123456789ab",
      ready: true,
    });
  });

  it("is not ready when a variable is missing, without saying which", async () => {
    const response = await handleHealth(get(), deps({ env: { ...FULL_ENV, SENTRY_DSN: "" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ready).toBe(false);
    expect(JSON.stringify(body)).not.toContain("SENTRY");
  });

  it("is not ready while the demo account is on", async () => {
    const env = { ...FULL_ENV, DEMO_ACCOUNT_EMAIL: "d@x.test", DEMO_ACCOUNT_PASSWORD: "pw123456" };
    const body = await (await handleHealth(get(), deps({ env }))).json();
    expect(body.ready).toBe(false);
  });

  it("answers 503 and not ready when Supabase does not answer", async () => {
    const response = await handleHealth(
      get(),
      deps({ supabase: async () => ({ status: "unreachable", project: "abcdefghijklmnopqrst" }) }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).ready).toBe(false);
  });

  it("gives the per-variable booleans to a caller holding CRON_SECRET, never cached", async () => {
    const response = await handleHealth(
      get({ authorization: `Bearer ${TOKEN}` }),
      deps({ env: { ...FULL_ENV, RESEND_API_KEY: "", DEMO_ACCOUNT_EMAIL: "d@x.test" } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.env.RESEND_API_KEY).toBe(false);
    expect(body.env.EMAIL_FROM).toBe(true);
    expect(body.demoAccount).toBe(true);
    expect(body.ready).toBe(false);
  });

  it("refuses a wrong token without asking Supabase", async () => {
    const supabase = vi.fn(async () => ({ status: "ok" as const, project: "x" }));
    const response = await handleHealth(get({ authorization: "Bearer wrong" }), deps({ supabase }));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(supabase).not.toHaveBeenCalled();
  });

  it("refuses every token when CRON_SECRET is unset or too short", async () => {
    for (const secret of [undefined, "", "short"]) {
      const response = await handleHealth(
        get({ authorization: "Bearer short" }),
        deps({ env: { ...FULL_ENV, CRON_SECRET: secret } }),
      );
      expect(response.status).toBe(401);
    }
  });
});

describe("createSupabaseMemo", () => {
  it("asks Supabase at most once per window", async () => {
    let clock = 0;
    const check = vi.fn(async () => ({ status: "ok" as const, project: "p" }));
    const memo = createSupabaseMemo(check, 10_000, () => clock);
    await memo();
    await memo();
    expect(check).toHaveBeenCalledTimes(1);
    clock = 10_001;
    await memo();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers", async () => {
    const check = vi.fn(async () => ({ status: "ok" as const, project: "p" }));
    const memo = createSupabaseMemo(check, 10_000, () => 0);
    await Promise.all([memo(), memo(), memo()]);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
