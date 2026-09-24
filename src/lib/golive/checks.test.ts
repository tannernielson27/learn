import { describe, expect, it } from "vitest";
import {
  backupCheck,
  exposedSchemasCheck,
  healthChecks,
  MANUAL_STEPS,
  migrationsCheck,
  parseExposedSchemas,
  reminderJobCheck,
  sessionStateCheck,
  type HealthReading,
} from "./checks.ts";
import { REQUIRED_ENV, type DetailedHealth, type PublicHealth } from "./envVars.ts";

const REF = "abcdefghijklmnopqrst";

describe("migrationsCheck", () => {
  it("passes when the applied list is exactly the repo's", () => {
    expect(migrationsCheck(["1", "2"], ["1", "2"])).toMatchObject({ status: "pass" });
  });

  it("fails naming what is not applied and what the repo lacks", () => {
    const result = migrationsCheck(["1", "2", "3"], ["1", "9"]);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not applied: 2, 3");
    expect(result.detail).toContain("applied but not in the repo: 9");
  });

  it("shortens a long list", () => {
    const repo = ["1", "2", "3", "4", "5", "6", "7"];
    expect(migrationsCheck(repo, []).detail).toContain("1, 2, 3, 4, 5 and 2 more");
  });

  it("fails when the repo list is empty, rather than passing vacuously", () => {
    expect(migrationsCheck([], []).status).toBe("fail");
  });
});

describe("parseExposedSchemas", () => {
  it("reads the hint PostgREST 12+ gives", () => {
    const body = {
      code: "PGRST106",
      hint: "Only the following schemas are exposed: public, graphql_public",
      message: "Invalid schema: golive_probe",
    };
    expect(parseExposedSchemas(body)).toEqual(["public", "graphql_public"]);
  });

  it("reads the message older versions give", () => {
    const body = {
      code: "PGRST106",
      hint: null,
      message: "The schema must be one of the following: public, live",
    };
    expect(parseExposedSchemas(body)).toEqual(["public", "live"]);
  });

  it("returns null for anything else", () => {
    expect(parseExposedSchemas(null)).toBeNull();
    expect(parseExposedSchemas("x")).toBeNull();
    expect(parseExposedSchemas({ code: "PGRST000" })).toBeNull();
    expect(parseExposedSchemas({ code: "PGRST106", hint: "no list" })).toBeNull();
  });
});

describe("exposedSchemasCheck", () => {
  it("passes with public and graphql_public only", () => {
    expect(exposedSchemasCheck(["public", "graphql_public"]).status).toBe("pass");
  });

  it("fails naming live or private when exposed", () => {
    const result = exposedSchemasCheck(["public", "live", "private"]);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("live, private");
  });

  it("fails when the list could not be read", () => {
    expect(exposedSchemasCheck(null).status).toBe("fail");
  });
});

describe("sessionStateCheck", () => {
  const open = {
    table_exists: true,
    anon_usage: true,
    anon_select: true,
    rls: true,
    open_policy: true,
  };

  it("fails while the open policy applies to anon (#178 not yet applied)", () => {
    const result = sessionStateCheck(open);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("#178");
  });

  it("fails when row level security is off", () => {
    expect(sessionStateCheck({ ...open, rls: false, open_policy: false }).status).toBe("fail");
  });

  it("passes once only narrow policies remain", () => {
    expect(sessionStateCheck({ ...open, open_policy: false }).status).toBe("pass");
  });

  it("passes when anon has no grant or no schema usage, or the table is gone", () => {
    expect(sessionStateCheck({ ...open, anon_select: false }).status).toBe("pass");
    expect(sessionStateCheck({ ...open, anon_usage: false }).status).toBe("pass");
    expect(sessionStateCheck({ ...open, table_exists: false }).status).toBe("pass");
  });
});

describe("reminderJobCheck", () => {
  const good = { has_cron: true, job_count: 1, job_active: true, vault_names: 2 };

  it("passes with the job active and both Vault names present", () => {
    expect(reminderJobCheck(good).status).toBe("pass");
  });

  it.each([
    [{ ...good, has_cron: false }, "pg_cron is not enabled"],
    [{ ...good, job_count: 0 }, "no job by that name"],
    [{ ...good, job_active: false }, "inactive"],
    [{ ...good, vault_names: 1 }, "Vault lacks"],
  ])("fails: %o", (row, text) => {
    const result = reminderJobCheck(row);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain(text);
  });
});

describe("backupCheck", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it("passes with a backup artifact from the last 26 hours", () => {
    const run = { createdAt: "2026-09-25T09:17:00Z", artifacts: ["db-backup-2026-09-25T0917Z"] };
    expect(backupCheck(run, now).status).toBe("pass");
  });

  it("fails with no successful run", () => {
    expect(backupCheck(null, now).status).toBe("fail");
  });

  it("fails when the newest success is older than 26 hours", () => {
    const run = { createdAt: "2026-09-24T09:00:00Z", artifacts: ["db-backup-x"] };
    expect(backupCheck(run, now).status).toBe("fail");
  });

  it("fails on an unreadable date", () => {
    expect(backupCheck({ createdAt: "soon", artifacts: ["db-backup-x"] }, now).status).toBe("fail");
  });

  it("fails on a green run that uploaded nothing (secrets unset)", () => {
    const run = { createdAt: "2026-09-25T09:17:00Z", artifacts: [] };
    const result = backupCheck(run, now);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("BACKUP_AGE_RECIPIENT");
  });
});

const publicBody = (overrides: Partial<PublicHealth> = {}): PublicHealth => ({
  supabase: "ok",
  project: REF,
  version: "0123456789ab",
  ready: true,
  ...overrides,
});

const allEnv = Object.fromEntries(
  REQUIRED_ENV.map(({ name }) => [name, true]),
) as DetailedHealth["env"];

const detailed = (overrides: Partial<DetailedHealth> = {}): HealthReading => ({
  kind: "detailed",
  body: { ...publicBody(), env: allEnv, demoAccount: false, ...overrides },
});

const byId = (reading: HealthReading, project = REF) =>
  Object.fromEntries(healthChecks(reading, project).map((result) => [result.id, result]));

describe("healthChecks", () => {
  it("passes every line on a ready site with the detailed view", () => {
    const lines = byId(detailed());
    expect(lines.site.status).toBe("pass");
    expect(lines.site.detail).toContain("0123456789ab");
    expect(lines.env.status).toBe("pass");
    expect(lines.demo.status).toBe("pass");
  });

  it("names each missing variable with the step that sets it", () => {
    const env = { ...allEnv, RESEND_API_KEY: false, SENTRY_DSN: false };
    const lines = byId(detailed({ env, ready: false }));
    expect(lines.env.status).toBe("fail");
    expect(lines.env.detail).toContain("RESEND_API_KEY (§7.7 step 6)");
    expect(lines.env.detail).toContain("SENTRY_DSN (§7.9 step 5)");
  });

  it("treats a variable the site did not report as missing", () => {
    const env = { ...allEnv } as Partial<DetailedHealth["env"]>;
    delete env.CRON_SECRET;
    const lines = byId(detailed({ env: env as DetailedHealth["env"] }));
    expect(lines.env.detail).toContain("CRON_SECRET");
  });

  it("fails the demo line while the demo account is on", () => {
    const lines = byId(detailed({ demoAccount: true }));
    expect(lines.demo.status).toBe("fail");
    expect(lines.demo.detail).toContain("DEMO_ACCOUNT_EMAIL");
  });

  it("fails the site line when Supabase is unreachable or it is another project", () => {
    expect(byId(detailed({ supabase: "unreachable" })).site.status).toBe("fail");
    const other = byId(detailed(), "zzzzzzzzzzzzzzzzzzzz").site;
    expect(other.status).toBe("fail");
    expect(other.detail).toContain(`uses ${REF}`);
  });

  it("with the public view, trusts ready for both lines", () => {
    const lines = byId({ kind: "public", body: publicBody(), tokenRefused: false });
    expect(lines.env.status).toBe("pass");
    expect(lines.demo.status).toBe("pass");
  });

  it("with the public view and not ready, fails env and asks for the token for demo", () => {
    const lines = byId({ kind: "public", body: publicBody({ ready: false }), tokenRefused: false });
    expect(lines.env.status).toBe("fail");
    expect(lines.env.detail).toContain("GOLIVE_HEALTH_TOKEN");
    expect(lines.demo.status).toBe("manual");
  });

  it("says so when the site refused the token", () => {
    const lines = byId({ kind: "public", body: publicBody({ ready: false }), tokenRefused: true });
    expect(lines.env.detail).toContain("refused");
  });

  it("fails all three lines when health could not be read", () => {
    const lines = healthChecks({ kind: "unreadable", reason: "HTTP 500" }, REF);
    expect(lines.map((l) => l.status)).toEqual(["fail", "fail", "fail"]);
    expect(lines[0].detail).toContain("HTTP 500");
  });
});

describe("MANUAL_STEPS", () => {
  it("are all manual and each names where to act", () => {
    expect(MANUAL_STEPS.every((step) => step.status === "manual")).toBe(true);
    expect(MANUAL_STEPS.map((step) => step.id)).toEqual([
      "realtime",
      "smtp",
      "auth-urls",
      "sentry",
      "rate-limit-sweep",
    ]);
  });
});
