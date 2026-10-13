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

/** The host's client, counting the requests it makes of each table. */
function countingClient(stack: FakeSupabase): { client: Client; requests: Map<string, number> } {
  const real = createFakeClient(stack, { role: "authenticated", orgId: ORG });
  const requests = new Map<string, number>();
  const client = {
    ...real,
    from(table: string) {
      requests.set(table, (requests.get(table) ?? 0) + 1);
      return (real.from as (name: string) => unknown)(table);
    },
  } as unknown as Client;
  return { client, requests };
}

/** A client whose read of `failing` answers with an error, and of anything else with no rows. */
function clientFailing(failing: string): Client {
  const chain = (table: string) => {
    const reply =
      table === failing ? { data: null, error: { message: "down" } } : { data: [], error: null };
    const link: Record<string, unknown> = {
      then: (resolve: (value: typeof reply) => unknown) => Promise.resolve(reply).then(resolve),
    };
    for (const method of ["select", "eq", "order", "range"]) link[method] = () => link;
    return link;
  };
  return { from: chain } as unknown as Client;
}

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

  it("counts an answer once when two pages both carry it", async () => {
    // A row inserted between two page reads shifts the rest along, and one comes back twice.
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

  it.each(["participants", "session_responses"])(
    "is null when %s cannot be read",
    async (table) => {
      expect(await readProgress(clientFailing(table), SESSION, 3)).toBeNull();
    },
  );
});
