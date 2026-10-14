import { describe, expect, it, vi } from "vitest";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  SWEEP_LIMIT,
  createSweepLimiter,
  handleWorkspaceSweep,
  summarize,
  sweepMode,
  type SweepResult,
  type SweepRow,
  type WorkspaceSweepDeps,
} from "./sweepRoute";

const SECRET = "s".repeat(40);
const URL = "https://learn.example/api/cron/workspace-sweep";
const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b1";
const ORG_C = "00000000-0000-4000-8000-0000000000c1";

const ROWS: SweepRow[] = [
  { orgId: ORG_A, rule: "memberless", outcome: "would_delete", reason: null },
  { orgId: ORG_B, rule: "never_used", outcome: "would_delete", reason: null },
  { orgId: ORG_C, rule: "memberless", outcome: "skipped", reason: "enrolled_students" },
];

function deps(overrides: Partial<WorkspaceSweepDeps> = {}): WorkspaceSweepDeps {
  return {
    secret: SECRET,
    mode: undefined,
    sweep: vi.fn(async (): Promise<SweepResult> => ({ status: "ok", rows: ROWS })),
    limiter: createSweepLimiter(createMemoryRateLimitStore()),
    log: vi.fn(),
    ...overrides,
  };
}

function post(authorization?: string, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), ...headers },
  });
}

const authorised = () => post(`Bearer ${SECRET}`);

describe("sweepMode", () => {
  it("deletes only when the variable is exactly `delete`", () => {
    expect(sweepMode("delete")).toBe("delete");
  });

  it.each([undefined, "", "Delete", "DELETE", " delete", "delete ", "delete\n", "true", "1", "on"])(
    "is a dry run for %j",
    (value) => {
      expect(sweepMode(value)).toBe("dry_run");
    },
  );
});

describe("handleWorkspaceSweep: the secret", () => {
  it("refuses a request with no secret, without touching the database", async () => {
    const d = deps();
    const response = await handleWorkspaceSweep(post(), d);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(d.sweep).not.toHaveBeenCalled();
  });

  it("refuses a wrong secret, even with deletion switched on", async () => {
    const d = deps({ mode: "delete" });
    const response = await handleWorkspaceSweep(post(`Bearer ${"x".repeat(40)}`), d);
    expect(response.status).toBe(401);
    expect(d.sweep).not.toHaveBeenCalled();
  });

  it("refuses the secret sent any way but as a Bearer header", async () => {
    const d = deps();
    expect((await handleWorkspaceSweep(post(SECRET), d)).status).toBe(401);
    expect((await handleWorkspaceSweep(post(`Basic ${SECRET}`), d)).status).toBe(401);
    expect(d.sweep).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "short", "s".repeat(31)])(
    "answers 503 and runs nothing when CRON_SECRET is %j",
    async (secret) => {
      const d = deps({ secret });
      const response = await handleWorkspaceSweep(post(`Bearer ${secret ?? ""}`), d);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "not_configured" });
      expect(d.sweep).not.toHaveBeenCalled();
    },
  );

  it("turns a guesser's 401 into 429 once over the limit, and still runs nothing", async () => {
    const store = createMemoryRateLimitStore();
    const d = deps({
      limiter: createSweepLimiter(store, {
        denied: { attempts: 1, windowMs: 60_000 },
        runs: { attempts: 5, windowMs: 60_000 },
      }),
    });
    const from = { "x-vercel-id": "iad1::1", "x-forwarded-for": "1.2.3.4" };
    expect((await handleWorkspaceSweep(post("Bearer wrong", from), d)).status).toBe(401);
    expect((await handleWorkspaceSweep(post("Bearer wrong", from), d)).status).toBe(429);
    expect(d.sweep).not.toHaveBeenCalled();
  });
});

describe("handleWorkspaceSweep: a dry run unless told otherwise", () => {
  it("is a dry run when WORKSPACE_SWEEP is not set", async () => {
    const d = deps();
    const response = await handleWorkspaceSweep(authorised(), d);
    expect(response.status).toBe(200);
    expect(d.sweep).toHaveBeenCalledTimes(1);
    expect(d.sweep).toHaveBeenCalledWith({ delete: false, limit: SWEEP_LIMIT });
    expect(await response.json()).toMatchObject({ status: "ok", mode: "dry_run" });
  });

  it.each(["Delete", "DELETE", " delete", "delete ", "true", "1", "yes", "dry_run", ""])(
    "is a dry run when WORKSPACE_SWEEP is %j",
    async (mode) => {
      const d = deps({ mode });
      await handleWorkspaceSweep(authorised(), d);
      expect(d.sweep).toHaveBeenCalledWith({ delete: false, limit: SWEEP_LIMIT });
    },
  );

  it("deletes when WORKSPACE_SWEEP is exactly `delete`, at most 20 workspaces a run", async () => {
    const d = deps({ mode: "delete" });
    const response = await handleWorkspaceSweep(authorised(), d);
    expect(SWEEP_LIMIT).toBe(20);
    expect(d.sweep).toHaveBeenCalledTimes(1);
    expect(d.sweep).toHaveBeenCalledWith({ delete: true, limit: 20 });
    expect(await response.json()).toMatchObject({ status: "ok", mode: "delete" });
  });

  it("takes nothing from the request: no query, header or body turns deletion on", async () => {
    const d = deps();
    const request = new Request(`${URL}?mode=delete&delete=true&limit=500`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json",
        "x-workspace-sweep": "delete",
      },
      body: JSON.stringify({ mode: "delete", delete: true, p_delete: true, limit: 500 }),
    });
    await handleWorkspaceSweep(request, d);
    expect(d.sweep).toHaveBeenCalledWith({ delete: false, limit: SWEEP_LIMIT });
  });
});

describe("handleWorkspaceSweep: what a run says", () => {
  it("answers counts by rule and outcome, and no id", async () => {
    const response = await handleWorkspaceSweep(authorised(), deps());
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      status: "ok",
      mode: "dry_run",
      counts: {
        memberless: { would_delete: 1, deleted: 0, skipped: 1 },
        never_used: { would_delete: 1, deleted: 0, skipped: 0 },
      },
    });
    expect(text).not.toContain(ORG_A);
  });

  it("writes one log line: the mode, the counts and the org ids", async () => {
    const log = vi.fn();
    await handleWorkspaceSweep(authorised(), deps({ log }));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("info", "[workspace-sweep] run", {
      mode: "dry_run",
      limit: 20,
      counts: {
        memberless: { would_delete: 1, deleted: 0, skipped: 1 },
        never_used: { would_delete: 1, deleted: 0, skipped: 0 },
      },
      wouldDelete: [ORG_A, ORG_B],
      deleted: [],
      skipped: [{ org: ORG_C, rule: "memberless", reason: "enrolled_students" }],
    });
  });

  it("logs deleted ids when deleting", async () => {
    const log = vi.fn();
    const rows: SweepRow[] = [
      { orgId: ORG_A, rule: "memberless", outcome: "deleted", reason: null },
      { orgId: ORG_B, rule: "never_used", outcome: "skipped", reason: "error_23514" },
    ];
    const sweep = vi.fn(async (): Promise<SweepResult> => ({ status: "ok", rows }));
    await handleWorkspaceSweep(authorised(), deps({ mode: "delete", sweep, log }));
    expect(log).toHaveBeenCalledWith(
      "info",
      "[workspace-sweep] run",
      expect.objectContaining({
        mode: "delete",
        deleted: [ORG_A],
        wouldDelete: [],
        skipped: [{ org: ORG_B, rule: "never_used", reason: "error_23514" }],
      }),
    );
  });

  it("still logs a line when there was nothing to do", async () => {
    const log = vi.fn();
    const sweep = vi.fn(async (): Promise<SweepResult> => ({ status: "ok", rows: [] }));
    const response = await handleWorkspaceSweep(authorised(), deps({ sweep, log }));
    expect(await response.json()).toEqual({
      status: "ok",
      mode: "dry_run",
      counts: {
        memberless: { would_delete: 0, deleted: 0, skipped: 0 },
        never_used: { would_delete: 0, deleted: 0, skipped: 0 },
      },
    });
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("summarize: only ids and known words reach the log", () => {
  it("never passes on text the database was not meant to send", () => {
    const summary = summarize([
      { orgId: "Ada's workspace", rule: "memberless", outcome: "deleted", reason: null },
      { orgId: ORG_A, rule: "ada@school.test", outcome: "deleted", reason: null },
      { orgId: ORG_B, rule: "never_used", outcome: "emailed ada@school.test", reason: null },
      { orgId: ORG_C, rule: "memberless", outcome: "skipped", reason: "ask ada@school.test" },
    ]);
    const text = JSON.stringify(summary);
    expect(text).not.toContain("Ada");
    expect(text).not.toContain("ada@school.test");
    expect(summary.unrecognised).toBe(3);
    expect(summary.skipped).toEqual([{ org: ORG_C, rule: "memberless", reason: "unknown" }]);
    expect(summary.deleted).toEqual([]);
  });

  it("counts every row once", () => {
    const summary = summarize(ROWS);
    expect(summary.unrecognised).toBe(0);
    expect(summary.counts.memberless).toEqual({ would_delete: 1, deleted: 0, skipped: 1 });
    expect(summary.counts.never_used).toEqual({ would_delete: 1, deleted: 0, skipped: 0 });
  });
});

describe("handleWorkspaceSweep: before the migration is applied", () => {
  it("answers cleanly and logs `not available` when the function is missing", async () => {
    const log = vi.fn();
    const sweep = vi.fn(async (): Promise<SweepResult> => ({ status: "not_available" }));
    const response = await handleWorkspaceSweep(authorised(), deps({ sweep, log }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "not_available", mode: "dry_run" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("info", "[workspace-sweep] not available", {
      mode: "dry_run",
    });
  });

  it("says the same with deletion switched on", async () => {
    const sweep = vi.fn(async (): Promise<SweepResult> => ({ status: "not_available" }));
    const response = await handleWorkspaceSweep(authorised(), deps({ mode: "delete", sweep }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "not_available", mode: "delete" });
  });
});

describe("handleWorkspaceSweep: failures", () => {
  it("answers 500 and logs the error's name and code, never its message's addresses", async () => {
    const log = vi.fn();
    const sweep = vi.fn(async (): Promise<SweepResult> => {
      throw new Error("sweep_abandoned_workspaces: 57014 for ada@school.test");
    });
    const response = await handleWorkspaceSweep(authorised(), deps({ sweep, log }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "failed" });
    expect(log).toHaveBeenCalledTimes(1);
    const [level, message, details] = log.mock.calls[0] as [string, string, object];
    expect(level).toBe("error");
    expect(message).toBe("[workspace-sweep] the run failed");
    expect(JSON.stringify(details)).not.toContain("ada@school.test");
    expect(JSON.stringify(details)).toContain("57014");
  });
});

describe("handleWorkspaceSweep: the run limit", () => {
  it("refuses an authorised run over the limit, so a leaked secret cannot loop it", async () => {
    const d = deps({
      limiter: createSweepLimiter(createMemoryRateLimitStore(), {
        denied: { attempts: 5, windowMs: 60_000 },
        runs: { attempts: 1, windowMs: 60_000 },
      }),
    });
    expect((await handleWorkspaceSweep(authorised(), d)).status).toBe(200);
    const second = await handleWorkspaceSweep(authorised(), d);
    expect(second.status).toBe(429);
    expect(d.sweep).toHaveBeenCalledTimes(1);
  });

  it("counts its runs apart from the reminder job's, in the shared store", async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createSweepLimiter(store);
    await limiter.takeRun();
    await limiter.takeDenied("1.2.3.4");
    expect(store.hits()).toEqual([
      { bucket: "cron_runs", key: "workspace_sweep" },
      { bucket: "cron_denied", key: "1.2.3.4" },
    ]);
  });

  function failingLimiter() {
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("PGRST301"));
    return createSweepLimiter(store);
  }

  it("still refuses a wrong secret when the limiter cannot answer", async () => {
    const d = deps({ limiter: failingLimiter() });
    expect((await handleWorkspaceSweep(post("Bearer wrong"), d)).status).toBe(401);
    expect(d.sweep).not.toHaveBeenCalled();
  });

  it("does not run when an authorised run cannot be counted", async () => {
    const d = deps({ mode: "delete", limiter: failingLimiter() });
    const response = await handleWorkspaceSweep(authorised(), d);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "rate_limit_unavailable" });
    expect(d.sweep).not.toHaveBeenCalled();
  });
});
