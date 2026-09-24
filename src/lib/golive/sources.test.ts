import { describe, expect, it, vi } from "vitest";
import {
  ALL_SQL,
  CRON_JOB_SQL,
  CRON_PRESENT_SQL,
  migrationVersions,
  parseQueryRows,
  probeExposedSchemas,
  readAppliedMigrations,
  readHealth,
  readLatestBackup,
  readReminderJob,
  readSessionState,
  SESSION_STATE_SQL,
  VAULT_NAMES_SQL,
  type Query,
} from "./sources.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the SQL the check sends", () => {
  it("is only single read-only SELECT statements", () => {
    for (const sql of ALL_SQL) {
      expect(sql.trimStart().toLowerCase().startsWith("select")).toBe(true);
      expect(sql).not.toContain(";");
      expect(sql).not.toMatch(
        /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|do|set|copy)\b\s/i,
      );
    }
  });
});

describe("parseQueryRows", () => {
  it("reads the CLI's {rows} output after a progress line", () => {
    expect(parseQueryRows('Connecting...\n{"boundary":"x","rows":[{"a":1}]}')).toEqual([{ a: 1 }]);
  });

  it("reads a bare array", () => {
    expect(parseQueryRows('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("rejects output with no JSON or no rows", () => {
    expect(() => parseQueryRows("error: nope")).toThrow("no JSON");
    expect(() => parseQueryRows('{"message":"x"}')).toThrow("no rows");
  });
});

describe("the database readers", () => {
  it("reads applied versions as strings", async () => {
    const query: Query = async () => [{ version: "20260913000000" }, { version: 20260914000000 }];
    await expect(readAppliedMigrations(query)).resolves.toEqual([
      "20260913000000",
      "20260914000000",
    ]);
  });

  it("reads the session-state row, accepting t/f text too", async () => {
    const query: Query = async (sql) => {
      expect(sql).toBe(SESSION_STATE_SQL);
      return [
        { table_exists: true, anon_usage: "t", anon_select: true, rls: true, open_policy: false },
      ];
    };
    await expect(readSessionState(query)).resolves.toEqual({
      table_exists: true,
      anon_usage: true,
      anon_select: true,
      rls: true,
      open_policy: false,
    });
  });

  it("refuses anything but one row", async () => {
    await expect(readSessionState(async () => [])).rejects.toThrow("expected one row, got 0");
  });

  it("does not ask cron.job when pg_cron is absent", async () => {
    const query = vi.fn<Query>(async (sql) =>
      sql === CRON_PRESENT_SQL ? [{ has_cron: false }] : [{ vault_names: 0 }],
    );
    await expect(readReminderJob(query)).resolves.toEqual({
      has_cron: false,
      job_count: 0,
      job_active: false,
      vault_names: 0,
    });
    expect(query).not.toHaveBeenCalledWith(CRON_JOB_SQL);
  });

  it("reads the job and the Vault names when pg_cron is present", async () => {
    const answers = new Map<string, Record<string, unknown>>([
      [CRON_PRESENT_SQL, { has_cron: true }],
      [VAULT_NAMES_SQL, { vault_names: 2 }],
      [CRON_JOB_SQL, { job_count: "1", job_active: true }],
    ]);
    const query: Query = async (sql) => [answers.get(sql) ?? {}];
    await expect(readReminderJob(query)).resolves.toEqual({
      has_cron: true,
      job_count: 1,
      job_active: true,
      vault_names: 2,
    });
  });
});

describe("migrationVersions", () => {
  it("keeps timestamped SQL files, sorted, and ignores the rest", () => {
    expect(
      migrationVersions([
        "20260914000000_b.sql",
        "20260913000000_a.sql",
        "README.md",
        "2026_bad.sql",
        "20260915000000_c.sql.bak",
      ]),
    ).toEqual(["20260913000000", "20260914000000"]);
  });
});

describe("probeExposedSchemas", () => {
  it("asks for a schema that cannot exist, sending only the publishable key", async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        {
          code: "PGRST106",
          hint: "Only the following schemas are exposed: public, graphql_public",
        },
        406,
      ),
    );
    await expect(
      probeExposedSchemas(fetchImpl, "https://abc.supabase.co/", "sb_publishable_x"),
    ).resolves.toEqual(["public", "graphql_public"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abc.supabase.co/rest/v1/");
    expect(init.headers).toEqual({
      apikey: "sb_publishable_x",
      "Accept-Profile": "golive_probe_schema",
    });
    expect(init.redirect).toBe("error");
  });

  it("returns null for a body that is not JSON", async () => {
    const fetchImpl = async () => new Response("<html>", { status: 502 });
    await expect(probeExposedSchemas(fetchImpl, "https://a", "k")).resolves.toBeNull();
  });
});

const PUBLIC = { supabase: "ok", project: "local", version: "local", ready: false };
const DETAILED = { ...PUBLIC, env: { RESEND_API_KEY: false }, demoAccount: true };

describe("readHealth", () => {
  it("reads the public view with no token and sends no Authorization header", async () => {
    const fetchImpl = vi.fn(async () => json(PUBLIC));
    await expect(readHealth(fetchImpl, "https://site.example", null)).resolves.toEqual({
      kind: "public",
      body: PUBLIC,
      tokenRefused: false,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://site.example/api/health");
    expect(init.headers).toEqual({});
    expect(init.redirect).toBe("manual");
  });

  it("reads the detailed view with the token, on a cache-busting URL", async () => {
    const fetchImpl = vi.fn(async () => json(DETAILED));
    await expect(readHealth(fetchImpl, "https://site.example", "tok")).resolves.toEqual({
      kind: "detailed",
      body: DETAILED,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/site\.example\/api\/health\?detail=\d+$/);
    expect(init.headers).toEqual({ authorization: "Bearer tok" });
  });

  it("falls back to the public view when the token is refused", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(json(PUBLIC));
    await expect(readHealth(fetchImpl, "https://site.example", "bad")).resolves.toEqual({
      kind: "public",
      body: PUBLIC,
      tokenRefused: true,
    });
  });

  it("is unreadable when the fallback is not a report either", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(new Response("<html>", { status: 500 }));
    const reading = await readHealth(fetchImpl, "https://site.example", "bad");
    expect(reading).toEqual({ kind: "unreadable", reason: "HTTP 500: not the health report" });
  });

  it("treats a token answered with the public view as public (an old deployment)", async () => {
    const fetchImpl = vi.fn(async () => json(PUBLIC));
    const reading = await readHealth(fetchImpl, "https://site.example", "tok");
    expect(reading.kind).toBe("public");
  });

  it("reads a 503 report, which is still a report", async () => {
    const body = { ...PUBLIC, supabase: "unreachable" };
    const reading = await readHealth(async () => json(body, 503), "https://s.example", null);
    expect(reading).toEqual({ kind: "public", body, tokenRefused: false });
  });

  it("names a redirect instead of following it", async () => {
    const redirect = new Response(null, { status: 307, headers: { location: "https://login" } });
    const reading = await readHealth(async () => redirect, "https://s.example", null);
    expect(reading).toMatchObject({
      kind: "unreadable",
      reason: expect.stringContaining("redirected"),
    });
  });
});

describe("readLatestBackup", () => {
  it("returns the newest success and its unexpired artifact names", async () => {
    const gh = vi
      .fn()
      .mockResolvedValueOnce('[{"databaseId":42,"createdAt":"2026-09-25T09:17:00Z"}]')
      .mockResolvedValueOnce('["db-backup-2026-09-25T0917Z"]');
    await expect(readLatestBackup(gh)).resolves.toEqual({
      createdAt: "2026-09-25T09:17:00Z",
      artifacts: ["db-backup-2026-09-25T0917Z"],
    });
    expect(gh.mock.calls[0][0]).toEqual(
      expect.arrayContaining(["run", "list", "--workflow", "db-backup.yml", "--status", "success"]),
    );
    expect(gh.mock.calls[1][0][1]).toBe("repos/{owner}/{repo}/actions/runs/42/artifacts");
  });

  it("returns null when there is no successful run", async () => {
    await expect(readLatestBackup(async () => "[]")).resolves.toBeNull();
  });

  it("ignores artifact output that is not a list of names", async () => {
    const gh = vi
      .fn()
      .mockResolvedValueOnce('[{"databaseId":1,"createdAt":"2026-09-25T09:17:00Z"}]')
      .mockResolvedValueOnce('{"x":1}');
    await expect(readLatestBackup(gh)).resolves.toEqual({
      createdAt: "2026-09-25T09:17:00Z",
      artifacts: [],
    });
  });

  it("rejects when gh fails, so the caller can mark the line manual", async () => {
    await expect(
      readLatestBackup(async () => Promise.reject(new Error("not logged in"))),
    ).rejects.toThrow("not logged in");
  });
});
