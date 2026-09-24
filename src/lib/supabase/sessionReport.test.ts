import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  RECENT_SESSION_LIMIT,
  listRecentSessions,
  readAllPages,
  readReportItems,
  readSessionReport,
} from "./sessionReport";

type Client = Parameters<typeof readSessionReport>[0];
type Reply = { data: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };

/**
 * A stand-in for the query builder: every call is recorded and returns the same chain, and
 * awaiting the chain answers with that table's reply. A `range(from, to)` slices an array reply,
 * which is how paging is exercised.
 */
function fakeClient(replies: Record<string, Reply>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let range: [number, number] | null = null;
    const reply = (): Reply => {
      const base = replies[table] ?? { data: null, error: { message: `no reply for ${table}` } };
      if (!range || !Array.isArray(base.data)) return base;
      return { ...base, data: base.data.slice(range[0], range[1] + 1) };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "range", "maybeSingle"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === "range") range = [args[0] as number, args[1] as number];
        return chain;
      };
    }
    chain.then = (resolve: (value: Reply) => unknown) => resolve(reply());
    return chain;
  };
  return { client: { from } as unknown as Client, calls };
}

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const ITEM_A = "00000000-0000-4000-8000-00000000001a";
const ITEM_B = "00000000-0000-4000-8000-00000000001b";
const ITEM_GONE = "00000000-0000-4000-8000-00000000001c";

const sessionRow = {
  id: SESSION,
  title: "Cardiac week 3",
  status: "ended",
  opened_at: "2026-09-22T10:00:00Z",
  closed_at: "2026-09-22T10:40:00Z",
  item_set: [ITEM_A, ITEM_B, ITEM_GONE, 42],
};

const okReplies = (): Record<string, Reply> => ({
  sessions: { data: sessionRow, error: null },
  items: {
    data: [
      { id: ITEM_B, type: "bowtie", cjmm_step: 5, ref: "bowtie-act" },
      { id: ITEM_A, type: "multiple_choice", cjmm_step: 1, ref: "mc-vitals" },
    ],
    error: null,
  },
  participants: {
    data: [{ id: "p-ava", display_name: "Ava", joined_at: "2026-09-22T10:01:00Z" }],
    error: null,
  },
  session_responses: {
    data: [{ participant_id: "p-ava", item_position: 1, points: "1.00", max_points: 1 }],
    error: null,
  },
});

describe("readSessionReport", () => {
  it("reads a session another org's author cannot see as not there", async () => {
    const fake = fakeClient({ sessions: { data: null, error: null } });
    expect(await readSessionReport(fake.client, SESSION)).toBeNull();
    // Nothing else is asked for once the session itself is not visible.
    expect(fake.calls.every((call) => call.table === "sessions")).toBe(true);
  });

  it("builds the report input in session order from the rows it can see", async () => {
    const fake = fakeClient(okReplies());
    const read = await readSessionReport(fake.client, SESSION);
    expect(read?.session).toEqual({
      id: SESSION,
      title: "Cardiac week 3",
      status: "ended",
      openedAt: "2026-09-22T10:00:00Z",
      closedAt: "2026-09-22T10:40:00Z",
    });
    expect(read?.input.items).toEqual([
      { position: 1, itemId: ITEM_A, ref: "mc-vitals", type: "multiple_choice", cjmmStep: 1 },
      { position: 2, itemId: ITEM_B, ref: "bowtie-act", type: "bowtie", cjmmStep: 5 },
      // An item the author can no longer read keeps its place, named by its id.
      { position: 3, itemId: ITEM_GONE, ref: ITEM_GONE, type: null, cjmmStep: null },
    ]);
    expect(read?.input.participants).toEqual([
      { id: "p-ava", displayName: "Ava", joinedAt: "2026-09-22T10:01:00Z" },
    ]);
    expect(read?.input.responses).toEqual([
      { participantId: "p-ava", itemPosition: 1, points: 1, maxPoints: 1 },
    ]);
  });

  it("selects display names and scores only: no profile, no answer, no answer key", async () => {
    const fake = fakeClient(okReplies());
    await readSessionReport(fake.client, SESSION);
    const selected = fake.calls
      .filter((call) => call.method === "select")
      .map((call) => `${call.table}: ${String(call.args[0])}`);
    expect(selected).toEqual(
      expect.arrayContaining([
        "items: id, type, cjmm_step, ref:content->>id",
        "participants: id, display_name, joined_at",
        "session_responses: participant_id, item_position, points, max_points",
      ]),
    );
    expect(selected.join(" ")).not.toMatch(
      /profile_id|answer_key|rationale|response,|\bresponse\b/,
    );
  });

  it("scopes the participant and response reads to the one session", async () => {
    const fake = fakeClient(okReplies());
    await readSessionReport(fake.client, SESSION);
    const scoped = fake.calls.filter((call) => call.method === "eq").map((call) => call.table);
    expect(scoped).toEqual(
      expect.arrayContaining(["sessions", "participants", "session_responses"]),
    );
    expect(
      fake.calls.filter((call) => call.method === "eq").every((call) => call.args[1] === SESSION),
    ).toBe(true);
  });

  it("does not read items for a session with none", async () => {
    const replies = okReplies();
    const fake = fakeClient({
      ...replies,
      sessions: { data: { ...sessionRow, item_set: {} }, error: null },
    });
    const read = await readSessionReport(fake.client, SESSION);
    expect(read?.input.items).toEqual([]);
    expect(fake.calls.some((call) => call.table === "items")).toBe(false);
  });

  it("gives an item with a step out of range no step", async () => {
    const replies = okReplies();
    const fake = fakeClient({
      ...replies,
      items: { data: [{ id: ITEM_A, type: "bowtie", cjmm_step: 9, ref: null }], error: null },
    });
    const read = await readSessionReport(fake.client, SESSION);
    expect(read?.input.items[0]).toMatchObject({ ref: ITEM_A, cjmmStep: null });
  });

  it("throws rather than show half a report when a read fails", async () => {
    await expect(
      readSessionReport(
        fakeClient({ sessions: { data: null, error: { message: "boom" } } }).client,
        SESSION,
      ),
    ).rejects.toThrow(/session/);
    for (const table of ["items", "participants", "session_responses"]) {
      const fake = fakeClient({ ...okReplies(), [table]: { data: null, error: { message: "x" } } });
      await expect(readSessionReport(fake.client, SESSION)).rejects.toThrow(/could not read/);
    }
  });
});

describe("readAllPages", () => {
  it("keeps reading until a page comes back short", async () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, index) => index);
    const asked: [number, number][] = [];
    const read = await readAllPages<number>(async (from, to) => {
      asked.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    }, "rows");
    expect(read).toEqual(rows);
    expect(asked).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1],
    ]);
  });

  it("reads an exact multiple of the page size with one empty page at the end", async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, index) => index);
    const read = await readAllPages<number>(
      async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
      "rows",
    );
    expect(read).toHaveLength(PAGE_SIZE);
  });
});

describe("listRecentSessions", () => {
  it("lists newest first, a limited number, with the roster size", async () => {
    const fake = fakeClient({
      sessions: {
        data: [
          { ...sessionRow, participants: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}` })) },
          { ...sessionRow, id: "s2", status: "running", closed_at: null, participants: [] },
        ],
        error: null,
      },
    });
    expect(await listRecentSessions(fake.client)).toEqual([
      {
        id: SESSION,
        title: "Cardiac week 3",
        status: "ended",
        openedAt: "2026-09-22T10:00:00Z",
        closedAt: "2026-09-22T10:40:00Z",
        participantCount: 24,
      },
      {
        id: "s2",
        title: "Cardiac week 3",
        status: "running",
        openedAt: "2026-09-22T10:00:00Z",
        closedAt: null,
        participantCount: 0,
      },
    ]);
    expect(fake.calls).toEqual(
      expect.arrayContaining([
        { table: "sessions", method: "order", args: ["opened_at", { ascending: false }] },
        { table: "sessions", method: "limit", args: [RECENT_SESSION_LIMIT] },
      ]),
    );
  });

  it("answers null when the list cannot be read", async () => {
    const fake = fakeClient({ sessions: { data: null, error: { message: "down" } } });
    expect(await listRecentSessions(fake.client)).toBeNull();
  });
});

describe("readReportItems", () => {
  it("lists a set's items in the set's order, keeping one it can no longer read", async () => {
    const fake = fakeClient(okReplies());
    expect(await readReportItems(fake.client, [ITEM_B, ITEM_GONE])).toEqual([
      { position: 1, itemId: ITEM_B, ref: "bowtie-act", type: "bowtie", cjmmStep: 5 },
      { position: 2, itemId: ITEM_GONE, ref: ITEM_GONE, type: null, cjmmStep: null },
    ]);
  });

  it("reads nothing for an empty set", async () => {
    const fake = fakeClient({});
    expect(await readReportItems(fake.client, [])).toEqual([]);
    expect(fake.calls).toEqual([]);
  });
});
