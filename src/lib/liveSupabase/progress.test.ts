import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { PAGE_SIZE } from "@/lib/supabase/sessionReport";
import { readProgress } from "./progress";
import { createFakeClient, FAKE_MAX_ROWS, FakeSupabase } from "./testing/fakeSupabase";

const SESSION = "session-1";
const ORG = "org-1";

type Client = SupabaseClient<Database>;

const personId = (index: number): string => `p-${String(index).padStart(3, "0")}`;

/** A session with `people` participants, each of whom has answered items 1 to `answeredEach`. */
function stackWith(people: number, answeredEach: number, sessionId = SESSION): FakeSupabase {
  const stack = new FakeSupabase();
  seed(stack, people, answeredEach, sessionId);
  return stack;
}

function seed(stack: FakeSupabase, people: number, answeredEach: number, sessionId: string): void {
  for (let index = 1; index <= people; index += 1) {
    stack.participants.push({
      id: `${sessionId}-${personId(index)}`,
      session_id: sessionId,
      org_id: ORG,
      display_name: `Student ${index}`,
      rejoin_secret: "secret",
      joined_at: new Date(Date.UTC(2026, 0, 1, 9, 0, index)).toISOString(),
    });
  }
  // Item by item, the way a class answers: one person's answers are never next to each other.
  for (let position = 1; position <= answeredEach; position += 1) {
    for (let index = 1; index <= people; index += 1) {
      stack.responses.push({
        session_id: sessionId,
        org_id: ORG,
        participant_id: `${sessionId}-${personId(index)}`,
        item_id: `item-${position}`,
        item_position: position,
        response: {},
        points: 1,
        max_points: 1,
        model: "dichotomous",
        breakdown: [],
        groups: null,
        reveal: null,
        submitted_at: new Date(Date.UTC(2026, 0, 1, 9, position, index)).toISOString(),
      });
    }
  }
}

/** How a request ends when a test breaks it: PostgREST says no, or the network never answers. */
type Breakage = "error" | "reject";

/**
 * Called as each request is made, with the table and which request of that table it is (1 first).
 * It may change the stack before the read runs, or name a way for the read to fail.
 */
type OnRequest = (table: string, nth: number) => Breakage | void;

/** A query that takes any chain and then fails the way it was told to. */
function brokenQuery(how: Breakage): unknown {
  const settle = (): Promise<unknown> =>
    how === "reject"
      ? Promise.reject(new Error("fetch failed"))
      : Promise.resolve({ data: null, error: { message: "down" } });
  const link: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      settle().then(resolve, reject),
  };
  for (const method of ["select", "eq", "order", "range"]) link[method] = () => link;
  return link;
}

/** The host's client, counting the requests it makes of each table. */
function countingClient(
  stack: FakeSupabase,
  onRequest: OnRequest = () => {},
): { client: Client; requests: Map<string, number> } {
  const real = createFakeClient(stack, { role: "authenticated", orgId: ORG });
  const requests = new Map<string, number>();
  const client = {
    ...real,
    from(table: string) {
      const nth = (requests.get(table) ?? 0) + 1;
      requests.set(table, nth);
      const broken = onRequest(table, nth);
      return broken ? brokenQuery(broken) : (real.from as (name: string) => unknown)(table);
    },
  } as unknown as Client;
  return { client, requests };
}

const full = (items: number, people: number): number[] =>
  Array.from({ length: items }, () => people);

describe("readProgress", () => {
  it("reports every answer of a class past PostgREST's row cap (#406)", async () => {
    const people = 110;
    const items = 12;
    const stack = stackWith(people, items);
    expect(people * items).toBeGreaterThan(FAKE_MAX_ROWS);

    const progress = await readProgress(
      createFakeClient(stack, { role: "authenticated" }),
      SESSION,
      items,
    );

    const everyItem = Array.from({ length: items }, (_, index) => index + 1);
    expect(progress?.answered).toEqual(Array.from({ length: items }, () => people));
    expect(progress?.rows).toHaveLength(people);
    expect(progress?.rows.reduce((sum, row) => sum + row.positions.length, 0)).toBe(1320);
    for (const row of progress?.rows ?? []) expect(row.positions).toEqual(everyItem);
  });

  it("makes one request of each table for a class under the cap", async () => {
    const { client, requests } = countingClient(stackWith(40, 12));

    const progress = await readProgress(client, SESSION, 12);

    expect(progress?.answered).toEqual(Array.from({ length: 12 }, () => 40));
    expect(requests.get("session_responses")).toBe(1);
    expect(requests.get("participants")).toBe(1);
  });

  it("pages only as far as the answers go", async () => {
    const { client, requests } = countingClient(stackWith(110, 12));

    await readProgress(client, SESSION, 12);

    expect(requests.get("session_responses")).toBe(Math.floor(1320 / PAGE_SIZE) + 1);
    expect(requests.get("participants")).toBe(1);
  });

  it("answers the same for an unchanged room, so the board's bailout still holds", async () => {
    const client = createFakeClient(stackWith(110, 12), { role: "authenticated" });

    const first = await readProgress(client, SESSION, 12);
    const second = await readProgress(client, SESSION, 12);

    expect(second).toEqual(first);
    expect(first?.rows.map((row) => row.participantId)).toEqual(
      Array.from({ length: 110 }, (_, index) => `${SESSION}-${personId(index + 1)}`),
    );
  });

  it("reads one session only", async () => {
    const stack = stackWith(3, 2);
    seed(stack, 5, 4, "session-2");

    const progress = await readProgress(
      createFakeClient(stack, { role: "authenticated" }),
      SESSION,
      4,
    );

    expect(progress?.answered).toEqual([3, 3, 0, 0]);
    expect(progress?.rows).toHaveLength(3);
  });

  it("leaves out an answer to a position the set does not have", async () => {
    const progress = await readProgress(
      createFakeClient(stackWith(2, 3), { role: "authenticated" }),
      SESSION,
      2,
    );

    expect(progress?.answered).toEqual([2, 2]);
    expect(progress?.rows.map((row) => row.positions)).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });

  it("counts a repeated row once", async () => {
    const stack = stackWith(1, 2);
    stack.responses.push({ ...stack.responses[0]! });

    const progress = await readProgress(
      createFakeClient(stack, { role: "authenticated" }),
      SESSION,
      2,
    );

    expect(progress?.answered).toEqual([1, 1]);
    expect(progress?.rows[0]?.positions).toEqual([1, 2]);
  });

  it("counts an answer once when one written between two pages brings it back", async () => {
    // 100 people x 10 items fills page one exactly. Before page two is read, someone the cursor
    // has already passed answers: every row moves along by one, and page two opens with the row
    // page one closed on.
    const stack = stackWith(100, 10);
    const early = { ...stack.responses[0]!, participant_id: `${SESSION}-${personId(0)}` };
    const { client, requests } = countingClient(stack, (table, nth) => {
      if (table === "session_responses" && nth === 2) stack.responses.push(early);
    });

    const progress = await readProgress(client, SESSION, 10);

    expect(requests.get("session_responses")).toBe(2);
    expect(progress?.answered).toEqual(full(10, 100));
    expect(progress?.rows.at(-1)?.positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each([
    { people: 100, pages: 2 },
    { people: 200, pages: 3 },
  ])(
    "reads one more, empty page when $people x 10 answers end on a page edge",
    async ({ people, pages }) => {
      expect((people * 10) % PAGE_SIZE).toBe(0);
      const { client, requests } = countingClient(stackWith(people, 10));

      const progress = await readProgress(client, SESSION, 10);

      expect(requests.get("session_responses")).toBe(pages);
      expect(progress?.answered).toEqual(full(10, people));
      expect(progress?.rows.every((row) => row.positions.length === 10)).toBe(true);
    },
  );

  it("reads an empty session as nobody and nothing answered, in one request each", async () => {
    const { client, requests } = countingClient(new FakeSupabase());

    expect(await readProgress(client, SESSION, 3)).toEqual({ answered: [0, 0, 0], rows: [] });
    expect(requests.get("session_responses")).toBe(1);
    expect(requests.get("participants")).toBe(1);
  });

  it("reads people who have answered nothing yet", async () => {
    const progress = await readProgress(
      createFakeClient(stackWith(2, 0), { role: "authenticated" }),
      SESSION,
      2,
    );

    expect(progress?.answered).toEqual([0, 0]);
    expect(progress?.rows.map((row) => row.positions)).toEqual([[], []]);
  });

  describe.each<Breakage>(["error", "reject"])("when a read ends in a %s", (how) => {
    it.each(["participants", "session_responses"])("is null for %s", async (failing) => {
      const { client } = countingClient(stackWith(3, 2), (table) =>
        table === failing ? how : undefined,
      );

      expect(await readProgress(client, SESSION, 2)).toBeNull();
    });

    it("is null, not a partial board, when the second page of answers fails", async () => {
      const { client, requests } = countingClient(stackWith(110, 12), (table, nth) =>
        table === "session_responses" && nth === 2 ? how : undefined,
      );

      expect(await readProgress(client, SESSION, 12)).toBeNull();
      expect(requests.get("session_responses")).toBe(2);
    });
  });
});
