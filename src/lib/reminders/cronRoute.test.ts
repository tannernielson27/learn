import { describe, expect, it, vi } from "vitest";
import { createMemoryMailer } from "@/lib/email/memory";
import { createCronLimiter, handleReminderCron, type ReminderCronDeps } from "./cronRoute";
import type { ReminderRow, ReminderStore } from "./sendReminders";

const SECRET = "s".repeat(40);
const URL = "https://learn.example/api/cron/assignment-reminders";
const ROW: ReminderRow = {
  outboxId: "outbox-1",
  assignmentId: "00000000-0000-4000-8000-0000000212b1",
  studentId: "00000000-0000-4000-8000-0000000212d1",
  kind: "opened",
  email: "ada@school.test",
  title: "Week 5",
  closesAt: "2026-09-24T23:00:00Z",
  timeZone: "America/Denver",
  tries: 1,
};

function fakeStore(rows: ReminderRow[] = [ROW]): ReminderStore {
  let pending = [...rows];
  return {
    enqueue: vi.fn(async () => ({ opened: rows.length, closingSoon: 0 })),
    claim: vi.fn(async () => {
      const due = pending;
      pending = [];
      return due;
    }),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => "retrying" as const),
    release: vi.fn(async () => {}),
  };
}

function deps(overrides: Partial<ReminderCronDeps> = {}): ReminderCronDeps {
  const store = fakeStore();
  return {
    secret: SECRET,
    store: () => store,
    mailer: () => createMemoryMailer(),
    autoSubmit: vi.fn(async () => 2),
    origin: () => "https://learn.example",
    limiter: createCronLimiter(),
    log: vi.fn(),
    now: () => new Date("2026-09-23T23:00:00Z"),
    ...overrides,
  };
}

function post(authorization?: string, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), ...headers },
  });
}

describe("handleReminderCron: the secret", () => {
  it("refuses a request with no secret, without touching the database or the mailer", async () => {
    const d = deps();
    const store = d.store();
    const response = await handleReminderCron(post(), d);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(store.enqueue).not.toHaveBeenCalled();
    expect(d.autoSubmit).not.toHaveBeenCalled();
  });

  it("refuses a wrong secret, a secret of another length, and a non-Bearer scheme", async () => {
    for (const header of [
      `Bearer ${"t".repeat(40)}`,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(1)}`,
      `Basic ${SECRET}`,
      `Bearer`,
      SECRET,
    ]) {
      const response = await handleReminderCron(post(header), deps());
      expect(response.status, header).toBe(401);
    }
  });

  it("refuses everything when the deployment has no secret, or one too short to trust", async () => {
    for (const secret of [undefined, "", "short"]) {
      const response = await handleReminderCron(post(`Bearer ${secret}`), deps({ secret }));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "not_configured" });
    }
  });

  it("runs with the right secret and returns counts only", async () => {
    const d = deps();
    const response = await handleReminderCron(post(`Bearer ${SECRET}`), d);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      autoSubmitted: 2,
      opened: 1,
      closingSoon: 0,
      sent: 1,
      retrying: 0,
      failed: 0,
      deferred: 0,
    });
    expect(JSON.stringify(body)).not.toContain("@");
  });
});

describe("handleReminderCron: the work", () => {
  it("submits attempts left open at close before it sends anything", async () => {
    const d = deps();
    const store = d.store();
    await handleReminderCron(post(`Bearer ${SECRET}`), d);
    expect(vi.mocked(d.autoSubmit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(store.enqueue).mock.invocationCallOrder[0]!,
    );
  });

  it("still sends reminders when the submit at close fails, and says so in the log", async () => {
    const log = vi.fn();
    const d = deps({
      log,
      autoSubmit: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const response = await handleReminderCron(post(`Bearer ${SECRET}`), d);
    expect(response.status).toBe(200);
    expect((await response.json()).sent).toBe(1);
    expect(log).toHaveBeenCalledWith("[reminders] the submit at close failed", {
      error: "Error",
    });
  });

  it("answers 500 with no detail when the outbox cannot be read", async () => {
    const log = vi.fn();
    const store = fakeStore();
    vi.mocked(store.enqueue).mockRejectedValueOnce(
      new Error("enqueue_assignment_reminders: 42501"),
    );
    const response = await handleReminderCron(
      post(`Bearer ${SECRET}`),
      deps({ store: () => store, log }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "failed" });
    expect(log).toHaveBeenCalled();
  });

  it("sends a reminder once however many times the job runs", async () => {
    const mailer = createMemoryMailer();
    const store = fakeStore();
    const d = deps({ mailer: () => mailer, store: () => store });
    await handleReminderCron(post(`Bearer ${SECRET}`), d);
    await handleReminderCron(post(`Bearer ${SECRET}`), d);
    expect(mailer.sent()).toHaveLength(1);
  });

  it("never logs a recipient's address", async () => {
    const log = vi.fn();
    const failing = {
      async send() {
        throw new Error(`could not send to ${ROW.email}`);
      },
    };
    await handleReminderCron(post(`Bearer ${SECRET}`), deps({ log, mailer: () => failing }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("@");
  });
});

describe("handleReminderCron: rate limits", () => {
  it("limits wrong secrets per caller, so the secret cannot be guessed at speed", async () => {
    const limiter = createCronLimiter({
      denied: { attempts: 3, windowMs: 60_000 },
      runs: { attempts: 10, windowMs: 60_000 },
    });
    const statuses: number[] = [];
    for (let n = 0; n < 5; n += 1) {
      const response = await handleReminderCron(post("Bearer wrong"), deps({ limiter }));
      statuses.push(response.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it("does not let wrong secrets lock out the real job", async () => {
    const limiter = createCronLimiter({
      denied: { attempts: 1, windowMs: 60_000 },
      runs: { attempts: 10, windowMs: 60_000 },
    });
    await handleReminderCron(post("Bearer wrong"), deps({ limiter }));
    await handleReminderCron(post("Bearer wrong"), deps({ limiter }));
    const response = await handleReminderCron(post(`Bearer ${SECRET}`), deps({ limiter }));
    expect(response.status).toBe(200);
  });

  it("limits authorised runs too, so a leaked secret cannot drive the mailer flat out", async () => {
    const limiter = createCronLimiter({
      denied: { attempts: 10, windowMs: 60_000 },
      runs: { attempts: 2, windowMs: 60_000 },
    });
    const statuses: number[] = [];
    for (let n = 0; n < 3; n += 1) {
      const response = await handleReminderCron(post(`Bearer ${SECRET}`), deps({ limiter }));
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("opens a new window once the old one has passed", () => {
    const limiter = createCronLimiter({
      denied: { attempts: 1, windowMs: 1_000 },
      runs: { attempts: 1, windowMs: 1_000 },
    });
    expect(limiter.takeRun(0)).toBe(true);
    expect(limiter.takeRun(500)).toBe(false);
    expect(limiter.takeRun(1_000)).toBe(true);
    expect(limiter.takeDenied("1.2.3.4", 0)).toBe(true);
    expect(limiter.takeDenied("1.2.3.4", 10)).toBe(false);
    expect(limiter.takeDenied("5.6.7.8", 10)).toBe(true);
  });
});
