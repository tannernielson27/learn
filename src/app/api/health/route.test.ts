import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Distinctive values, so a leak anywhere in the response bytes is found by a plain substring search.
const KNOWN = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_KNOWNPUB7c1",
  SUPABASE_SECRET_KEY: "sb_secret_KNOWNSECRET8d2",
  SUPABASE_JWT_SIGNING_KEY: "KNOWNJWTSIGNINGKEY9e3",
  RESEND_API_KEY: "re_KNOWNRESEND0f4",
  EMAIL_FROM: "KNOWNSENDER <sender-a1@example.test>",
  CRON_SECRET: "KNOWNCRON".padEnd(64, "x"),
  SENTRY_DSN: "https://KNOWNDSNKEYb5@o1.ingest.us.sentry.io/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://KNOWNDSNKEYc6@o1.ingest.us.sentry.io/1",
  DEMO_ACCOUNT_EMAIL: "known-demo-d7@example.test",
  DEMO_ACCOUNT_PASSWORD: "KNOWNDEMOPASSWORDe8",
};

/** The substrings of each value worth searching for (the DSN's key, not its common host). */
const NEEDLES = [
  "KNOWNPUB7c1",
  "KNOWNSECRET8d2",
  "KNOWNJWTSIGNINGKEY9e3",
  "KNOWNRESEND0f4",
  "sender-a1",
  "KNOWNCRON",
  "KNOWNDSNKEYb5",
  "KNOWNDSNKEYc6",
  "known-demo-d7",
  "KNOWNDEMOPASSWORDe8",
];

const leaked = (bytes: string) => NEEDLES.filter((needle) => bytes.includes(needle));

async function load() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  for (const [name, value] of Object.entries(KNOWN)) vi.stubEnv(name, value);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef0123456789abcdef0123456789abcdef01");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const request = (headers: Record<string, string> = {}) =>
  new Request("https://learn.example/api/health", { headers });

describe("GET /api/health", () => {
  it("control: the search finds a known value when it is in the bytes", () => {
    expect(leaked(JSON.stringify(KNOWN)).sort()).toEqual([...NEEDLES].sort());
  });

  it("publishes no variable's value, and not which one is set, to an anonymous caller", async () => {
    const { GET } = await load();
    const response = await GET(request());
    const bytes = await response.text();
    expect(leaked(bytes)).toEqual([]);
    expect(JSON.parse(bytes)).toEqual({
      supabase: "ok",
      project: "abcdefghijklmnopqrst",
      version: "abcdef012345",
      ready: false,
    });
  });

  it("gives booleans, and no value, to a caller holding CRON_SECRET", async () => {
    const { GET } = await load();
    const response = await GET(request({ authorization: `Bearer ${KNOWN.CRON_SECRET}` }));
    const bytes = await response.text();
    expect(leaked(bytes)).toEqual([]);
    const body = JSON.parse(bytes);
    // Positive control: the values were really set and really read.
    expect(body.env.RESEND_API_KEY).toBe(true);
    expect(body.env.SENTRY_DSN).toBe(true);
    expect(body.demoAccount).toBe(true);
    expect(Object.values(body.env).every((v) => v === true)).toBe(true);
  });

  it("is ready once the demo account is off", async () => {
    vi.stubEnv("DEMO_ACCOUNT_EMAIL", "");
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", "");
    const { GET } = await load();
    expect((await (await GET(request())).json()).ready).toBe(true);
  });

  it("says not_configured, and 503, when the Supabase variables are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { GET } = await load();
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ supabase: "not_configured", ready: false });
  });

  it("answers 401 to a wrong token, with nothing else in the body", async () => {
    const { GET } = await load();
    const response = await GET(request({ authorization: "Bearer nope" }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('{"error":"unauthorized"}');
  });
});
