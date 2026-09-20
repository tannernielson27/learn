import { describe, expect, it, vi } from "vitest";
import {
  endSession,
  readHostSession,
  resolveSessionCode,
  startSession,
  type ResolvedCode,
} from "./sessions";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };

/**
 * `as unknown as Client` rather than `as never`: a partial mock cannot satisfy the whole
 * SupabaseClient shape, but this way the cast is to the type the function actually takes, so a
 * change in that parameter's type still fails here.
 */
type Client = Parameters<typeof startSession>[0];

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

function fakeRow(reply: Reply) {
  const maybeSingle = vi.fn(async () => reply);
  const eq = vi.fn<(column: string, value: string) => { maybeSingle: typeof maybeSingle }>(() => ({
    maybeSingle,
  }));
  const select = vi.fn<(columns: string) => { eq: typeof eq }>(() => ({ eq }));
  const from = vi.fn<(table: string) => { select: typeof select }>(() => ({ select }));
  return { client: { from } as unknown as Client, from, select, eq };
}

const BANK = "00000000-0000-4000-8000-0000000000b1";
const CASE = "00000000-0000-4000-8000-0000000000c1";
const SESSION = "00000000-0000-4000-8000-0000000000a1";

describe("startSession", () => {
  it("starts from a bank in one call and hands back the new session", async () => {
    const fake = fakeRpc({ data: SESSION, error: null });
    expect(await startSession(fake.client, { kind: "bank", id: BANK })).toEqual({
      ok: true,
      sessionId: SESSION,
    });
    expect(fake.rpc).toHaveBeenCalledWith("start_session", { source_bank: BANK });
  });

  it("starts from a case study by naming the other argument, never both", async () => {
    const fake = fakeRpc({ data: SESSION, error: null });
    await startSession(fake.client, { kind: "case_study", id: CASE });
    expect(fake.rpc).toHaveBeenCalledWith("start_session", { source_case_study: CASE });
  });

  it("reads a source in another org as gone, which is how the database answers it", async () => {
    const fake = fakeRpc({ error: { code: "P0002" } });
    expect(await startSession(fake.client, { kind: "bank", id: BANK })).toEqual({
      ok: false,
      reason: "gone",
    });
  });

  it("separates a source with nothing published from a source that is not there", async () => {
    const fake = fakeRpc({ error: { code: "22023" } });
    expect(await startSession(fake.client, { kind: "bank", id: BANK })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("says it failed on anything else", async () => {
    const fake = fakeRpc({ error: { code: "08006" } });
    expect(await startSession(fake.client, { kind: "bank", id: BANK })).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("does not claim success when the call answers with no id", async () => {
    const fake = fakeRpc({ data: null, error: null });
    expect(await startSession(fake.client, { kind: "bank", id: BANK })).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("endSession", () => {
  it("ends the session and reports when it closed", async () => {
    const fake = fakeRpc({ data: "2026-09-19T10:00:00Z", error: null });
    expect(await endSession(fake.client, SESSION)).toEqual({
      ok: true,
      closedAt: "2026-09-19T10:00:00Z",
    });
    expect(fake.rpc).toHaveBeenCalledWith("end_session", { target: SESSION });
  });

  it("reads another org's session as gone", async () => {
    const fake = fakeRpc({ error: { code: "P0002" } });
    expect(await endSession(fake.client, SESSION)).toEqual({ ok: false, reason: "gone" });
  });

  it("says it failed on anything else", async () => {
    const fake = fakeRpc({ error: { code: "08006" } });
    expect(await endSession(fake.client, SESSION)).toEqual({ ok: false, reason: "failed" });
    const empty = fakeRpc({ data: null, error: null });
    expect(await endSession(empty.client, SESSION)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("readHostSession", () => {
  it("returns only what a console shows, and counts the set rather than shipping it", async () => {
    const fake = fakeRow({
      data: {
        id: SESSION,
        title: "Cardiac basics",
        code: "AJ4K7P",
        status: "running",
        mode: "instructor_paced",
        item_set: ["a", "b", "c"],
        opened_at: "2026-09-19T09:00:00Z",
        closed_at: null,
      },
      error: null,
    });
    expect(await readHostSession(fake.client, SESSION)).toEqual({
      id: SESSION,
      title: "Cardiac basics",
      code: "AJ4K7P",
      status: "running",
      mode: "instructor_paced",
      itemCount: 3,
      openedAt: "2026-09-19T09:00:00Z",
      closedAt: null,
    });
    expect(fake.from).toHaveBeenCalledWith("sessions");
    expect(fake.select.mock.calls[0][0]).not.toContain("answer");
  });

  it("counts nothing when the set is not an array", async () => {
    const fake = fakeRow({
      data: {
        id: SESSION,
        title: "T",
        code: "AJ4K7P",
        status: "lobby",
        mode: "student_paced",
        item_set: null,
        opened_at: "2026-09-19T09:00:00Z",
        closed_at: null,
      },
      error: null,
    });
    expect(await readHostSession(fake.client, SESSION)).toMatchObject({ itemCount: 0 });
  });

  it("is null when row level security hides the row, and when the read errors", async () => {
    expect(await readHostSession(fakeRow({ data: null, error: null }).client, SESSION)).toBeNull();
    expect(await readHostSession(fakeRow({ error: { code: "42501" } }).client, SESSION)).toBeNull();
  });
});

describe("resolveSessionCode", () => {
  const openRow = [
    {
      session_id: SESSION,
      session_status: "lobby",
      session_mode: "instructor_paced",
      session_title: "Cardiac basics",
    },
  ];

  it("resolves an open code and passes the address as the bucket key", async () => {
    const fake = fakeRpc({ data: openRow, error: null });
    expect(await resolveSessionCode(fake.client, "aj4-k7p", "203.0.113.7")).toEqual({
      status: "open",
      sessionId: SESSION,
      sessionStatus: "lobby",
      mode: "instructor_paced",
      title: "Cardiac basics",
    } satisfies ResolvedCode);
    expect(fake.rpc).toHaveBeenCalledWith("resolve_session_code", {
      session_code: "AJ4K7P",
      client_key: "203.0.113.7",
    });
  });

  it("sends no key at all off the platform, so the shared bucket is the database's choice", async () => {
    const fake = fakeRpc({ data: openRow, error: null });
    await resolveSessionCode(fake.client, "AJ4K7P", null);
    expect(fake.rpc).toHaveBeenCalledWith("resolve_session_code", {
      session_code: "AJ4K7P",
      client_key: undefined,
    });
  });

  it("answers an ended session and a code that never existed the same way", async () => {
    const fake = fakeRpc({ data: [], error: null });
    expect(await resolveSessionCode(fake.client, "AJ4K7P", "203.0.113.7")).toEqual({
      status: "unknown",
    });
  });

  it("does not spend a round trip, or the caller's budget, on something that is not a code", async () => {
    const fake = fakeRpc({ data: openRow, error: null });
    expect(await resolveSessionCode(fake.client, "AJ4K7", "203.0.113.7")).toEqual({
      status: "unknown",
    });
    expect(await resolveSessionCode(fake.client, "AJ4K7O", "203.0.113.7")).toEqual({
      status: "unknown",
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("reports the database's refusal as a rate limit, not as an unknown code", async () => {
    const fake = fakeRpc({ error: { code: "PT429" } });
    expect(await resolveSessionCode(fake.client, "AJ4K7P", "203.0.113.7")).toEqual({
      status: "rate_limited",
    });
  });

  it("fails closed: a database that cannot answer is never reported as an open session", async () => {
    const fake = fakeRpc({ error: { code: "08006" } });
    expect(await resolveSessionCode(fake.client, "AJ4K7P", "203.0.113.7")).toEqual({
      status: "unavailable",
    });
  });
});
