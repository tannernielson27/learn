import { describe, expect, it, vi } from "vitest";
import { EmailError, type EmailMessage, type Mailer } from "@/lib/email";
import { createMemoryMailer } from "@/lib/email/memory";
import {
  MAX_BACKOFF_SECONDS,
  reminderIdempotencyKey,
  retryDelaySeconds,
  sendDueReminders,
  type ReminderRow,
  type ReminderStore,
} from "./sendReminders";

const A = "00000000-0000-4000-8000-0000000212b1";
const S1 = "00000000-0000-4000-8000-0000000212d1";
const S2 = "00000000-0000-4000-8000-0000000212d2";
const S3 = "00000000-0000-4000-8000-0000000212d3";
const ADDRESSES = ["ada@school.test", "grace@school.test", "hal@school.test"];

function row(n: number, overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    outboxId: `outbox-${n}`,
    assignmentId: A,
    studentId: [S1, S2, S3][n - 1] ?? S1,
    kind: "opened",
    email: ADDRESSES[n - 1] ?? ADDRESSES[0]!,
    title: "Week 5",
    closesAt: "2026-09-24T23:00:00Z",
    timeZone: "America/Denver",
    tries: 1,
    ...overrides,
  };
}

/** An outbox in memory that behaves like the SQL: claim leases, complete marks sent once. */
function fakeStore(rows: ReminderRow[]) {
  const state = new Map(rows.map((r) => [r.outboxId, "pending" as string]));
  const store = {
    enqueue: vi.fn(async () => ({ opened: rows.length, closingSoon: 0 })),
    claim: vi.fn(async (limit: number) => {
      const due = rows.filter((r) => state.get(r.outboxId) === "pending").slice(0, limit);
      for (const r of due) state.set(r.outboxId, "claimed");
      return due;
    }),
    complete: vi.fn(async (id: string) => {
      state.set(id, "sent");
    }),
    fail: vi.fn(async (id: string, _kind: string, retryIn: number | null) => {
      state.set(id, retryIn === null ? "failed" : "retrying");
      return retryIn === null ? ("failed" as const) : ("retrying" as const);
    }),
    release: vi.fn(async (ids: readonly string[]) => {
      for (const id of ids) state.set(id, "pending");
    }),
  } satisfies ReminderStore;
  return { store, state };
}

const OPTIONS = { origin: "https://learn.example", now: new Date("2026-09-23T23:00:00Z") };

function failingMailer(errors: (Error | null)[]): Mailer & { calls: EmailMessage[] } {
  const calls: EmailMessage[] = [];
  let n = 0;
  return {
    calls,
    async send(message) {
      calls.push(message);
      const error = errors[n++] ?? null;
      if (error) throw error;
      return { id: `sent-${n}` };
    },
  };
}

describe("reminderIdempotencyKey", () => {
  it("is built from what the message is about, never the address, in Resend's character set", () => {
    const key = reminderIdempotencyKey(row(1, { kind: "closing_soon" }));
    expect(key).toBe(`reminder:${A}:${S1}:closing_soon`);
    expect(key).toMatch(/^[\w:.-]+$/);
    expect(key).not.toContain("@");
  });
});

describe("retryDelaySeconds", () => {
  it("backs off exponentially from five minutes, capped", () => {
    expect(retryDelaySeconds(1)).toBe(300);
    expect(retryDelaySeconds(2)).toBe(600);
    expect(retryDelaySeconds(3)).toBe(1200);
    expect(retryDelaySeconds(20)).toBe(MAX_BACKOFF_SECONDS);
  });

  it("waits at least as long as Resend's Retry-After", () => {
    expect(retryDelaySeconds(1, 900)).toBe(900);
    expect(retryDelaySeconds(3, 10)).toBe(1200);
  });
});

describe("sendDueReminders", () => {
  it("sends each claimed reminder once through the mailer and marks it sent", async () => {
    const { store, state } = fakeStore([row(1), row(2, { kind: "closing_soon" })]);
    const mailer = createMemoryMailer();

    const result = await sendDueReminders(store, mailer, OPTIONS);

    expect(result).toEqual({
      enqueued: { opened: 2, closingSoon: 0 },
      sent: 2,
      retrying: 0,
      failed: 0,
      deferred: 0,
    });
    const sent = mailer.sent();
    expect(sent.map((m) => m.to)).toEqual(["ada@school.test", "grace@school.test"]);
    expect(sent[0]).toMatchObject({
      subject: "Week 5 is open",
      idempotencyKey: `reminder:${A}:${S1}:opened`,
    });
    expect(sent[1]?.subject).toBe("Week 5 closes tomorrow at 17:00");
    expect(sent[0]?.text).toContain(`https://learn.example/learn/assignments/${A}`);
    expect(store.complete).toHaveBeenCalledWith("outbox-1", "memory-1");
    expect([...state.values()]).toEqual(["sent", "sent"]);

    // The job runs again: nothing is pending, so nothing is sent twice.
    const again = await sendDueReminders(store, mailer, OPTIONS);
    expect(again.sent).toBe(0);
    expect(mailer.sent()).toHaveLength(2);
  });

  it("enqueues before it claims", async () => {
    const { store } = fakeStore([]);
    await sendDueReminders(store, createMemoryMailer(), OPTIONS);
    expect(store.enqueue.mock.invocationCallOrder[0]).toBeLessThan(
      store.claim.mock.invocationCallOrder[0]!,
    );
  });

  it("leaves a reminder for retry, with backoff, when the mailer fails in a way retrying fixes", async () => {
    const { store, state } = fakeStore([row(1, { tries: 2 }), row(2)]);
    const mailer = failingMailer([
      new EmailError("unavailable", "Resend is down", { status: 503 }),
    ]);

    const result = await sendDueReminders(store, mailer, OPTIONS);

    expect(result).toMatchObject({ sent: 1, retrying: 1, failed: 0 });
    expect(store.fail).toHaveBeenCalledWith("outbox-1", "unavailable", retryDelaySeconds(2));
    expect(state.get("outbox-1")).toBe("retrying");
    expect(state.get("outbox-2")).toBe("sent");
  });

  it("treats an unexpected throw as retryable", async () => {
    const { store } = fakeStore([row(1)]);
    const result = await sendDueReminders(store, failingMailer([new TypeError("boom")]), OPTIONS);
    expect(result.retrying).toBe(1);
    expect(store.fail).toHaveBeenCalledWith("outbox-1", "unavailable", 300);
  });

  it("gives up when the store says the reminder has used every try", async () => {
    const { store } = fakeStore([row(1, { tries: 5 })]);
    store.fail.mockResolvedValueOnce("failed");
    const result = await sendDueReminders(
      store,
      failingMailer([new EmailError("network", "no reply")]),
      OPTIONS,
    );
    expect(result).toMatchObject({ retrying: 0, failed: 1 });
  });

  it("gives up at once on a failure retrying cannot fix", async () => {
    const { store, state } = fakeStore([row(1)]);
    const result = await sendDueReminders(
      store,
      failingMailer([new EmailError("rejected", "Resend refused it", { status: 422 })]),
      OPTIONS,
    );
    expect(result).toMatchObject({ failed: 1, retrying: 0 });
    expect(store.fail).toHaveBeenCalledWith("outbox-1", "rejected", null);
    expect(state.get("outbox-1")).toBe("failed");
  });

  it("gives up on a row with no address without calling the mailer", async () => {
    const { store } = fakeStore([row(1, { email: null })]);
    const mailer = failingMailer([]);
    const result = await sendDueReminders(store, mailer, OPTIONS);
    expect(mailer.calls).toHaveLength(0);
    expect(result.failed).toBe(1);
    expect(store.fail).toHaveBeenCalledWith("outbox-1", "invalid", null);
  });

  it("stops the batch when Resend says slow down, and hands the rest back untried", async () => {
    const { store, state } = fakeStore([row(1), row(2), row(3)]);
    const mailer = failingMailer([
      null,
      new EmailError("rate_limited", "slow down", { status: 429, retryAfterSeconds: 30 }),
    ]);

    const result = await sendDueReminders(store, mailer, OPTIONS);

    expect(mailer.calls).toHaveLength(2);
    expect(result).toMatchObject({ sent: 1, retrying: 1, deferred: 1 });
    expect(store.fail).toHaveBeenCalledWith("outbox-2", "rate_limited", retryDelaySeconds(1, 30));
    expect(store.release).toHaveBeenCalledWith(["outbox-3"], 30);
    expect(state.get("outbox-3")).toBe("pending");
  });

  it("hands the whole batch back, try and all, when email is not configured", async () => {
    const { store, state } = fakeStore([row(1), row(2)]);
    const log = vi.fn();
    const mailer = failingMailer([new EmailError("config", "RESEND_API_KEY is not set.")]);

    const result = await sendDueReminders(store, mailer, { ...OPTIONS, log });

    expect(result).toMatchObject({ sent: 0, failed: 0, retrying: 0, deferred: 2 });
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.release).toHaveBeenCalledWith(["outbox-1", "outbox-2"], 900);
    expect(state.get("outbox-1")).toBe("pending");
    expect(log).toHaveBeenCalledWith("[reminders] email is not configured", {
      kind: "config",
    });
  });

  it("never writes a recipient's address to the log", async () => {
    const { store } = fakeStore([row(1), row(2), row(3)]);
    const log = vi.fn();
    const mailer = failingMailer([
      new EmailError("unavailable", "down"),
      new EmailError("rejected", "no"),
      new EmailError("rate_limited", "slow", { retryAfterSeconds: 5 }),
    ]);

    await sendDueReminders(store, mailer, { ...OPTIONS, log });

    expect(log).toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls);
    for (const address of ADDRESSES) expect(logged).not.toContain(address);
    expect(logged).not.toContain("@");
  });

  it("claims no more than the batch size", async () => {
    const { store } = fakeStore([row(1), row(2), row(3)]);
    await sendDueReminders(store, createMemoryMailer(), { ...OPTIONS, batch: 2 });
    expect(store.claim).toHaveBeenCalledWith(2);
  });
});
