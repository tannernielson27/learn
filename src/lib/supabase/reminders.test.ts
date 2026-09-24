import { describe, expect, it, vi } from "vitest";
import { createReminderStore } from "./reminders";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof createReminderStore>[0];

function fakeRpc(...replies: Reply[]) {
  const rpc = vi.fn(async () => ({ error: null, ...(replies.shift() ?? {}) }));
  return { client: { rpc } as unknown as Client, rpc };
}

const CLAIMED = {
  outbox_id: "o1",
  assignment_id: "a1",
  student_id: "s1",
  kind: "closing_soon",
  email: "ada@school.test",
  title: "Week 5",
  closes_at: "2026-09-24T23:00:00+00:00",
  time_zone: "America/Denver",
  tries: 2,
};

describe("createReminderStore", () => {
  it("enqueues and reads the two counts", async () => {
    const fake = fakeRpc({ data: [{ opened: 3, closing_soon: 1 }] });
    expect(await createReminderStore(fake.client).enqueue()).toEqual({ opened: 3, closingSoon: 1 });
    expect(fake.rpc).toHaveBeenCalledWith("enqueue_assignment_reminders");
  });

  it("claims a batch and maps each row", async () => {
    const fake = fakeRpc({ data: [CLAIMED, { ...CLAIMED, kind: "bogus", outbox_id: "o2" }] });
    const rows = await createReminderStore(fake.client).claim(20);
    expect(fake.rpc).toHaveBeenCalledWith("claim_assignment_reminders", {
      max_rows: 20,
      lease_seconds: 300,
    });
    expect(rows).toEqual([
      {
        outboxId: "o1",
        assignmentId: "a1",
        studentId: "s1",
        kind: "closing_soon",
        email: "ada@school.test",
        title: "Week 5",
        closesAt: "2026-09-24T23:00:00+00:00",
        timeZone: "America/Denver",
        tries: 2,
      },
    ]);
  });

  it("records each outcome", async () => {
    const fake = fakeRpc({ data: true }, { data: "failed" }, { data: 2 });
    const store = createReminderStore(fake.client);
    await store.complete("o1", "msg_1");
    expect(await store.fail("o2", "rejected", null)).toBe("failed");
    await store.release(["o3", "o4"], 30);
    expect(fake.rpc.mock.calls).toEqual([
      ["complete_assignment_reminder", { target: "o1", message_id: "msg_1" }],
      ["fail_assignment_reminder", { target: "o2", error_kind: "rejected" }],
      ["release_assignment_reminders", { targets: ["o3", "o4"], retry_in_seconds: 30 }],
    ]);
  });

  it("passes a retry delay when there is one, and reads an unknown answer as not found", async () => {
    const fake = fakeRpc({ data: "something else" });
    expect(await createReminderStore(fake.client).fail("o2", "network", 300)).toBe("not_found");
    expect(fake.rpc).toHaveBeenCalledWith("fail_assignment_reminder", {
      target: "o2",
      error_kind: "network",
      retry_in_seconds: 300,
    });
  });

  it("releases nothing without a call", async () => {
    const fake = fakeRpc();
    await createReminderStore(fake.client).release([], 30);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("throws an error naming the function and the code, never the data", async () => {
    for (const call of [
      (s: ReturnType<typeof createReminderStore>) => s.enqueue(),
      (s: ReturnType<typeof createReminderStore>) => s.claim(5),
      (s: ReturnType<typeof createReminderStore>) => s.complete("o1", "m"),
      (s: ReturnType<typeof createReminderStore>) => s.fail("o1", "network", 60),
      (s: ReturnType<typeof createReminderStore>) => s.release(["o1"], 0),
    ]) {
      const fake = fakeRpc({ error: { code: "42501", message: "ada@school.test denied" } });
      const failure = call(createReminderStore(fake.client));
      await expect(failure).rejects.toThrow(/_reminders?: 42501$/);
      await expect(failure).rejects.not.toThrow(/@/);
    }
  });
});
