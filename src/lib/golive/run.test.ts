import { describe, expect, it, vi } from "vitest";
import { redact, runGoLiveCheck, type GoLiveDeps, type GoLiveOptions } from "./run.ts";
import {
  CRON_JOB_SQL,
  CRON_PRESENT_SQL,
  MIGRATIONS_SQL,
  SESSION_STATE_SQL,
  SWEEP_JOB_SQL,
  VAULT_NAMES_SQL,
  type Query,
} from "./sources.ts";
import { REQUIRED_ENV } from "./envVars.ts";
import { exitCode, formatReport } from "./report.ts";

const REF = "abcdefghijklmnopqrst";
const OPTIONS: GoLiveOptions = {
  siteUrl: "https://site.example",
  expectedProject: REF,
  supabaseUrl: `https://${REF}.supabase.co`,
  publishableKey: "sb_publishable_x",
  healthToken: "t".repeat(64),
  repoMigrations: ["20260913000000", "20260914000000"],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const READY_DB = new Map<string, Record<string, unknown>[]>([
  [MIGRATIONS_SQL, [{ version: "20260913000000" }, { version: "20260914000000" }]],
  [
    SESSION_STATE_SQL,
    [{ table_exists: true, anon_usage: true, anon_select: true, rls: true, open_policy: false }],
  ],
  [CRON_PRESENT_SQL, [{ has_cron: true }]],
  [CRON_JOB_SQL, [{ job_count: 1, job_active: true }]],
  [VAULT_NAMES_SQL, [{ vault_names: 2 }]],
  [SWEEP_JOB_SQL, [{ job_count: 1, job_active: true }]],
]);

const readyQuery: Query = async (sql) => READY_DB.get(sql) ?? [];

function readyFetch(): GoLiveDeps["fetch"] {
  return async (input) => {
    if (input.includes("/rest/v1/")) {
      return json(
        {
          code: "PGRST106",
          hint: "Only the following schemas are exposed: public, graphql_public",
        },
        406,
      );
    }
    const env = Object.fromEntries(REQUIRED_ENV.map(({ name }) => [name, true]));
    return json({
      supabase: "ok",
      project: REF,
      version: "0123456789ab",
      ready: true,
      env,
      demoAccount: false,
    });
  };
}

const NOW = new Date("2026-09-25T12:00:00Z");

function readyGh(): GoLiveDeps["gh"] {
  return vi
    .fn()
    .mockResolvedValueOnce('[{"databaseId":7,"createdAt":"2026-09-25T09:17:00Z"}]')
    .mockResolvedValueOnce('["db-backup-2026-09-25T0917Z"]');
}

const deps = (overrides: Partial<GoLiveDeps> = {}): GoLiveDeps => ({
  query: readyQuery,
  fetch: readyFetch(),
  gh: readyGh(),
  now: () => NOW,
  ...overrides,
});

const statusById = (results: Awaited<ReturnType<typeof runGoLiveCheck>>) =>
  Object.fromEntries(results.map((result) => [result.id, result.status]));

describe("runGoLiveCheck", () => {
  it("passes every automated line on a ready production, then lists the manual steps", async () => {
    const results = await runGoLiveCheck(OPTIONS, deps());
    expect(statusById(results)).toEqual({
      migrations: "pass",
      schemas: "pass",
      "anon-state": "pass",
      site: "pass",
      env: "pass",
      demo: "pass",
      cron: "pass",
      "rate-limit-sweep": "pass",
      backup: "pass",
      realtime: "manual",
      smtp: "manual",
      "auth-urls": "manual",
      sentry: "manual",
    });
    expect(exitCode(results)).toBe(0);
  });

  it("turns a database that cannot be reached into failing lines, not a crash", async () => {
    const query: Query = async () => {
      throw new Error("Unauthorized: token sbp_0123456789abcdef is invalid");
    };
    const results = await runGoLiveCheck(OPTIONS, deps({ query }));
    const byId = Object.fromEntries(results.map((result) => [result.id, result]));
    expect(byId.migrations.status).toBe("fail");
    expect(byId["anon-state"].status).toBe("fail");
    expect(byId.cron.status).toBe("fail");
    expect(byId["rate-limit-sweep"].status).toBe("fail");
    expect(byId.migrations.detail).toContain("[redacted]");
    expect(byId.migrations.detail).not.toContain("sbp_0123");
    expect(exitCode(results)).toBe(1);
  });

  it("fails the sweep line when pg_cron is on but the sweep job is missing", async () => {
    const db = new Map([...READY_DB, [SWEEP_JOB_SQL, [{ job_count: 0, job_active: false }]]]);
    const results = await runGoLiveCheck(
      OPTIONS,
      deps({ query: async (sql) => db.get(sql) ?? [] }),
    );
    const sweep = results.find((result) => result.id === "rate-limit-sweep");
    expect(sweep?.status).toBe("fail");
    expect(sweep?.detail).toContain("select private.schedule_rate_limit_sweep()");
    expect(statusById(results).cron).toBe("pass");
  });

  it("marks the backup line manual when gh cannot answer", async () => {
    const gh = async () => {
      throw new Error("gh: To get started with GitHub CLI, please run: gh auth login");
    };
    const results = await runGoLiveCheck(OPTIONS, deps({ gh }));
    const backup = results.find((result) => result.id === "backup");
    expect(backup?.status).toBe("manual");
    expect(backup?.detail).toContain("gh auth login");
  });

  it("marks the schemas line manual without a publishable key, sending no probe", async () => {
    const fetchImpl = vi.fn(readyFetch());
    const results = await runGoLiveCheck(
      { ...OPTIONS, publishableKey: null },
      deps({ fetch: fetchImpl }),
    );
    expect(statusById(results).schemas).toBe("manual");
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/rest/v1/"))).toBe(false);
  });

  it("fails the site lines when the site cannot be reached", async () => {
    const fetchImpl: GoLiveDeps["fetch"] = async (input) => {
      if (input.includes("/api/health")) throw new Error("fetch failed");
      return readyFetch()(input);
    };
    const results = await runGoLiveCheck(OPTIONS, deps({ fetch: fetchImpl }));
    const statuses = statusById(results);
    expect([statuses.site, statuses.env, statuses.demo]).toEqual(["fail", "fail", "fail"]);
    expect(results.find((result) => result.id === "site")?.detail).toContain("fetch failed");
  });

  it("reports the local stack's expected failures", async () => {
    const localDb = new Map<string, Record<string, unknown>[]>([
      ...READY_DB,
      [
        SESSION_STATE_SQL,
        [{ table_exists: true, anon_usage: true, anon_select: true, rls: true, open_policy: true }],
      ],
      [CRON_PRESENT_SQL, [{ has_cron: false }]],
      [VAULT_NAMES_SQL, [{ vault_names: 0 }]],
    ]);
    const env = Object.fromEntries(
      REQUIRED_ENV.map(({ name }) => [name, !/RESEND|SENTRY|EMAIL/.test(name)]),
    );
    const fetchImpl: GoLiveDeps["fetch"] = async (input) =>
      input.includes("/rest/v1/")
        ? readyFetch()(input)
        : json({
            supabase: "ok",
            project: "local",
            version: "local",
            ready: false,
            env,
            demoAccount: true,
          });
    const results = await runGoLiveCheck(
      { ...OPTIONS, expectedProject: "local" },
      deps({ query: async (sql) => localDb.get(sql) ?? [], fetch: fetchImpl }),
    );
    const byId = Object.fromEntries(results.map((result) => [result.id, result]));
    expect(byId.env.detail).toContain("RESEND_API_KEY");
    expect(byId.env.detail).toContain("SENTRY_DSN");
    expect(byId.demo.status).toBe("fail");
    expect(byId["anon-state"].status).toBe("fail");
    expect(byId.cron.status).toBe("fail");
    expect(byId["rate-limit-sweep"].status).toBe("fail");
    expect(byId["rate-limit-sweep"].detail).toContain("pg_cron is not enabled");
    expect(formatReport(results)).toContain("Not ready");
  });
});

describe("redact", () => {
  it.each([
    "sb_secret_abcdef123",
    "sb_publishable_abc",
    "sbp_abc123",
    "re_ABCDEFGHijkl",
    "eyJhbGciOi.eyJyb2xlIjoi.c2lnbmF0dXJl",
    "postgresql://postgres:hunter2@db.example:5432/postgres",
    "Bearer abc.def",
    "password=hunter2",
  ])("masks %s", (secret) => {
    expect(redact(new Error(`failed near ${secret} here`))).not.toContain(secret);
  });

  it("keeps only the first non-empty line, and shortens a long one", () => {
    expect(redact(new Error("\nfirst\nsecond"))).toBe("first");
    expect(redact("x".repeat(500))).toHaveLength(203);
  });
});

describe("formatReport", () => {
  it("prints each line with its label and a summary", () => {
    const text = formatReport([
      { id: "a", title: "A", status: "pass", detail: "ok" },
      { id: "b", title: "B", status: "manual", detail: "do it" },
    ]);
    expect(text).toContain("PASS    A\n        ok");
    expect(text).toContain("MANUAL  B");
    expect(text).toContain("1 pass, 0 fail, 1 manual");
    expect(text).toContain("Every automated check passes");
  });
});
