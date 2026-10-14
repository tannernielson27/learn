import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PARTICIPANT_COOKIE, formatParticipantToken } from "@/lib/live/participantToken";
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  CONFORMANCE_WRONG,
} from "@/lib/live/roomConformance";
import type { SessionMode } from "@/lib/live";
import type { Item } from "@/lib/ngn/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { secretStartingOrderSeed } from "@/lib/supabase/startingOrderSeed";
import { participantFromCookie } from "./routeDeps";
import { createFakeClient } from "./testing/fakeSupabase";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";
import { forgetMissingViewFunction, readParticipantView, type ViewRouteDeps } from "./viewRoute";

/**
 * `POST /api/live/view` since #407: what one call costs the database, that it says the same thing
 * on the one function as on the calls that function replaced, that no key is in what it says
 * before the reveal, and what it answers when the database does not.
 *
 * Driven against the real handler over the fake database (`testing/fakeSupabase.ts`), which keeps
 * a list of every request it was sent. The count below is read from that list, so it is a count
 * of calls made and not of calls the route claims to make.
 */

const [FIRST, SECOND] = CONFORMANCE_ITEMS as [Item, Item, Item];
const URL_VIEW = "http://live.test/api/live/view";

interface StartedRoom {
  live: FakeRoom;
  /** Ada's participant id. */
  ada: string;
  /** The host shows the answers, and every phone has heard. */
  reveal: () => Promise<void>;
}

/** A room with Ada and Grace in it, started, with Ada having answered the first item. */
async function startedRoom(mode: SessionMode): Promise<StartedRoom> {
  const live = createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-000000000407",
    mode,
  });
  const host = live.host();
  await host.open();
  const ada = live.participant();
  const grace = live.participant();
  const joined = await ada.join(live.code, { displayName: "Ada Lovelace" });
  await grace.join(live.code, { displayName: "Grace Hopper" });
  await host.start();
  await live.settle();
  await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
  // Someone else's answer to the same item, which must never be read back to Ada.
  await grace.submit(FIRST.id, CONFORMANCE_WRONG);
  await live.settle();
  const reveal = async () => {
    await host.reveal();
    await live.settle();
  };
  return { live, ada: joined.participantId, reveal };
}

function depsFor(live: FakeRoom, now?: () => number): ViewRouteDeps {
  const service = createFakeClient(live.stack, { role: "service" });
  return {
    verify: participantFromCookie(service),
    service,
    startingOrderSeed: secretStartingOrderSeed,
    ...(now === undefined ? {} : { now }),
  };
}

/** One view, read as `participantId` with the cookie their join left, or with another secret. */
function viewRequest(live: FakeRoom, participantId: string, secret?: string): Request {
  const held = live.stack.participants.find((row) => row.id === participantId);
  if (!held) throw new Error(`no participant ${participantId}`);
  const token = formatParticipantToken({
    sessionId: held.session_id,
    participantId: held.id,
    secret: secret ?? held.rejoin_secret,
  });
  return new Request(URL_VIEW, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${PARTICIPANT_COOKIE}=${token}` },
    body: "{}",
  });
}

/** Reads the view once and answers with it and with the requests the database was sent for it. */
async function viewOnce(
  live: FakeRoom,
  participantId: string,
  deps: ViewRouteDeps = depsFor(live),
): Promise<{ response: Response; calls: string[] }> {
  const from = live.stack.roundTrips.length;
  const response = await readParticipantView(viewRequest(live, participantId), deps);
  return { response, calls: tidied(live.stack.roundTrips.slice(from)) };
}

/**
 * The function calls in the order they were made, then the table reads by name: the two reads of
 * the fallback are sent together, so which of them the database sees first is not the route's to
 * say.
 */
function tidied(calls: readonly string[]): string[] {
  const isRead = (call: string) => call.startsWith("select:");
  return [...calls.filter((call) => !isRead(call)), ...calls.filter(isRead).sort()];
}

let logged: MockInstance<typeof console.error>;

beforeEach(() => {
  forgetMissingViewFunction();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("what one view costs the database (#407)", () => {
  // Before #407, measured on `main` with this same counter: 4 for a step, 5 after a reveal and 4
  // for a student-paced set, two of each being writes (`last_seen_at` and the rate limit).
  const ONE = ["rpc:open_session_view"];
  const FALLBACK = [
    "rpc:resume_participant",
    "rpc:begin_session_view",
    "select:items",
    "select:session_responses",
  ];

  describe.each([
    { name: "on open_session_view", beforeMigration: false, expected: ONE },
    { name: "before the migration is pushed", beforeMigration: true, expected: FALLBACK },
  ])("$name", ({ beforeMigration, expected }) => {
    /** The steady state: a server that has already found out which database it is talking to. */
    async function settled(live: FakeRoom, ada: string): Promise<ViewRouteDeps> {
      live.stack.beforeViewMigration = beforeMigration;
      const deps = depsFor(live);
      await viewOnce(live, ada, deps);
      return deps;
    }

    it("a step the host has moved to", async () => {
      const { live, ada } = await startedRoom("instructor_paced");
      const { response, calls } = await viewOnce(live, ada, await settled(live, ada));
      expect(response.status).toBe(200);
      expect(calls).toEqual(expected);
    });

    it("after the reveal", async () => {
      const { live, ada, reveal } = await startedRoom("instructor_paced");
      await reveal();
      const { response, calls } = await viewOnce(live, ada, await settled(live, ada));
      expect(response.status).toBe(200);
      expect(calls).toEqual(expected);
    });

    it("a student-paced set", async () => {
      const { live, ada } = await startedRoom("student_paced");
      const { response, calls } = await viewOnce(live, ada, await settled(live, ada));
      expect(response.status).toBe(200);
      expect(calls).toEqual(expected);
    });

    it("the lobby, where there is no item to read", async () => {
      const live = createFakeRoom({
        items: CONFORMANCE_ITEMS,
        code: "LEARN7",
        sessionId: "00000000-0000-0000-0000-000000000407",
      });
      await live.host().open();
      const joined = await live.participant().join(live.code, { displayName: "Ada" });
      await live.settle();
      const deps = await settled(live, joined.participantId);
      const { calls } = await viewOnce(live, joined.participantId, deps);
      expect(calls).toEqual(expected.filter((call) => call.startsWith("rpc:")));
    });
  });
});

describe("a database the migration has not reached (#407)", () => {
  it("finds out once, then does not ask again until a minute has passed", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    live.stack.beforeViewMigration = true;
    let now = 1_000_000;
    const deps = depsFor(live, () => now);

    const first = await viewOnce(live, ada, deps);
    expect(first.response.status).toBe(200);
    expect(first.calls).toEqual([
      "rpc:open_session_view",
      "rpc:resume_participant",
      "rpc:begin_session_view",
      "select:items",
      "select:session_responses",
    ]);

    now += 59_000;
    expect((await viewOnce(live, ada, deps)).calls).not.toContain("rpc:open_session_view");

    // The owner pushes the migration. Within a minute the route is on the one call.
    live.stack.beforeViewMigration = false;
    now += 2_000;
    const after = await viewOnce(live, ada, deps);
    expect(after.response.status).toBe(200);
    expect(after.calls).toEqual(["rpc:open_session_view"]);
  });

  it("is not written to the log: a function that is not there yet is not a fault", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    live.stack.beforeViewMigration = true;
    await viewOnce(live, ada);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("the one call says what the four calls said (#407)", () => {
  /** The same room read both ways, as the bytes each way answered with. */
  async function bothWays(live: FakeRoom, who: string): Promise<{ one: string; four: string }> {
    live.stack.beforeViewMigration = false;
    forgetMissingViewFunction();
    const one = await viewOnce(live, who);
    live.stack.beforeViewMigration = true;
    const four = await viewOnce(live, who);
    live.stack.beforeViewMigration = false;
    forgetMissingViewFunction();
    expect(one.calls).toEqual(["rpc:open_session_view"]);
    expect(four.calls).toContain("rpc:begin_session_view");
    expect(one.response.status).toBe(200);
    return { one: await one.response.text(), four: await four.response.text() };
  }

  it.each(["instructor_paced", "student_paced"] as const)(
    "%s: before the reveal and after it, for someone who answered and someone who did not",
    async (mode) => {
      const { live, ada, reveal } = await startedRoom(mode);
      const lurker = await live.participant().join(live.code, { displayName: "Linus" });
      await live.settle();

      for (const who of [ada, lurker.participantId]) {
        const { one, four } = await bothWays(live, who);
        expect(one).toBe(four);
      }
      const answered = JSON.parse((await bothWays(live, ada)).one) as {
        answered?: unknown;
        set?: { answered: unknown }[];
      };
      // Not an empty agreement: Ada's own answer is in what both ways said.
      expect(answered.answered ?? answered.set?.[0]?.answered).toMatchObject({ itemId: FIRST.id });

      await reveal();
      for (const who of [ada, lurker.participantId]) {
        const { one, four } = await bothWays(live, who);
        expect(one).toBe(four);
        expect(one).toContain('"answerKey"');
      }
    },
  );
});

describe("no key in the response before the reveal (#407, ADR 0003)", () => {
  /** What only a key, a rationale, a scoring rule or a mark would put in a body. */
  const SECRETS = ['"answerKey"', "correctOptionId", "rationale", '"scoring"', '"points"'];

  it.each(["instructor_paced", "student_paced"] as const)(
    "%s: the function hands the route the key, and the route does not pass it on",
    async (mode) => {
      const { live, ada, reveal } = await startedRoom(mode);
      const service = createFakeClient(live.stack, { role: "service" });
      const held = live.stack.participants.find((row) => row.id === ada);

      // The control. What the route is handed does carry the key, so its absence from the
      // response below is the route's doing and not an empty payload's.
      const raw = await service.rpc("open_session_view", {
        target_participant: ada,
        target_session: live.sessionId,
        presented_secret: held?.rejoin_secret ?? "",
      });
      const handed = JSON.stringify(raw.data);
      expect(handed).toContain('"answer_key"');
      expect(handed).toContain("correctOptionId");
      expect(handed).toContain('"scoring"');
      // And no mark, even to the server, until the host has revealed.
      expect(handed).not.toContain('"points"');

      const before = await viewOnce(live, ada);
      expect(before.calls).toEqual(["rpc:open_session_view"]);
      const bytes = await before.response.text();
      expect(bytes).toContain(FIRST.id);
      expect(bytes).toContain(JSON.stringify(CONFORMANCE_CORRECT));
      for (const secret of SECRETS) expect(bytes).not.toContain(secret);
      expect(bytes).not.toContain("answer_key");
      // Grace's answer to the same item is hers.
      expect(bytes).not.toContain(JSON.stringify(CONFORMANCE_WRONG));

      // The second control: the same call after the reveal does carry them.
      await reveal();
      const after = await (await viewOnce(live, ada)).response.text();
      for (const secret of SECRETS) expect(after).toContain(secret);
      expect(after).not.toContain(JSON.stringify(CONFORMANCE_WRONG));
    },
  );

  it("shows only the item the room is on, not the ones still to come", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const bytes = await (await viewOnce(live, ada)).response.text();
    expect(bytes).toContain(FIRST.id);
    expect(bytes).not.toContain(SECOND.id);
  });
});

describe("who may read the room (#407)", () => {
  it("answers 401 to a token whose secret the database does not hold", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const response = await readParticipantView(
      viewRequest(live, ada, "cd".repeat(24)),
      depsFor(live),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "You have not joined this session." });
    expect(logged).not.toHaveBeenCalled();
  });

  /** A service client whose `open_session_view` answers one thing, and that counts its calls. */
  function answering(row: unknown): { deps: ViewRouteDeps; rpc: ReturnType<typeof vi.fn> } {
    const rpc = vi.fn(async () => ({ data: row === null ? [] : [row], error: null, status: 200 }));
    return {
      rpc,
      deps: {
        verify: async () => ({ ok: false, reason: "signed_out" }),
        service: { rpc } as unknown as SupabaseClient<Database>,
        startingOrderSeed: secretStartingOrderSeed,
      },
    };
  }

  it("passes the rate limit on as the refusal it is, having read nothing else", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const { deps, rpc } = answering({
      refusal: "rate_limited",
      session_status: null,
      session_items: null,
      server_now: "2027-01-15T08:00:00.000+00:00",
      view_items: null,
      view_answers: null,
    });
    const response = await readParticipantView(viewRequest(live, ada), deps);
    expect(response.status).toBe(429);
    expect(((await response.json()) as { refusal: string }).refusal).toBe("rate_limited");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("treats a refusal code it does not know as a fault, not as a room to draw", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const { deps } = answering({ refusal: "something_new", server_now: "2027-01-15T08:00:00Z" });
    const response = await readParticipantView(viewRequest(live, ada), deps);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("something_new");
  });

  it("refuses a room whose item the function did not hand back, rather than showing it wrong", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const { deps } = answering({
      refusal: null,
      session_status: "running",
      session_mode: "instructor_paced",
      session_position: 1,
      session_reveal: false,
      session_items: live.stack.sessions[0]?.item_set,
      session_timer_seconds: null,
      session_ends_at: null,
      session_remaining_ms: null,
      server_now: "2027-01-15T08:00:00.000+00:00",
      view_items: [],
      view_answers: [],
    });
    const response = await readParticipantView(viewRequest(live, ada), deps);
    expect(response.status).toBe(409);
  });
});

describe("when the database does not answer (#407)", () => {
  /** Everything the log was told, as one string to search. */
  const logText = () => JSON.stringify(logged.mock.calls);

  it("answers 503, never 401, and says which call it was", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    live.stack.unreachable.add("rpc:open_session_view");

    const { response, calls } = await viewOnce(live, ada);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "The session could not be reached. Try again.",
      retryable: true,
    });
    // Not answered by falling back either: a dropped call is not a missing function.
    expect(calls).toEqual(["rpc:open_session_view"]);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[live] a database call failed", {
      route: "/api/live/view",
      call: "open_session_view",
      sessionId: live.sessionId,
      status: 0,
      code: null,
      message: "TypeError: fetch failed",
      cause: "Caused by: Error: read ECONNRESET (ECONNRESET)",
    });
  });

  it("writes no secret, name, answer or key to the log", async () => {
    const { live, ada, reveal } = await startedRoom("instructor_paced");
    await reveal();
    const held = live.stack.participants.find((row) => row.id === ada);
    live.stack.unreachable.add("rpc:open_session_view");
    await viewOnce(live, ada);
    live.stack.unreachable.delete("rpc:open_session_view");
    live.stack.unreachable.add("rpc:resume_participant");
    live.stack.beforeViewMigration = true;
    forgetMissingViewFunction();
    await viewOnce(live, ada);

    expect(logged).toHaveBeenCalledTimes(2);
    const text = logText();
    expect(text).not.toContain(held?.rejoin_secret ?? "no secret");
    expect(text).not.toContain("Ada Lovelace");
    expect(text).not.toContain("correctOptionId");
    expect(text).not.toContain("opt_a");
    expect(text).not.toContain("stream_base_commons");
  });

  it("answers 503 for a database error that is not a missing function, without falling back", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
      status: 500,
    }));
    const response = await readParticipantView(viewRequest(live, ada), {
      ...depsFor(live),
      service: { rpc } as unknown as SupabaseClient<Database>,
    });
    expect(response.status).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      "[live] a database call failed",
      expect.objectContaining({ call: "open_session_view", code: "57014", status: 500 }),
    );
  });

  it("answers 500, which the phone does not retry, when the database refuses the call itself", async () => {
    const { live, ada } = await startedRoom("instructor_paced");
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "22P02", message: "invalid input syntax for type uuid" },
      status: 400,
    }));
    const response = await readParticipantView(viewRequest(live, ada), {
      ...depsFor(live),
      service: { rpc } as unknown as SupabaseClient<Database>,
    });
    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      "[live] a database call failed",
      expect.objectContaining({ call: "open_session_view", code: "22P02", status: 400 }),
    );
  });

  // The route as it runs before the migration is pushed. Each of its four calls, dropped in turn.
  it.each([
    ["rpc:resume_participant", "resume_participant"],
    ["rpc:begin_session_view", "begin_session_view"],
    ["select:items", "items"],
    ["select:session_responses", "session_responses"],
  ])("before the migration, a dropped %s is a 503 naming it", async (dropped, named) => {
    const { live, ada } = await startedRoom("instructor_paced");
    live.stack.beforeViewMigration = true;
    live.stack.unreachable.add(dropped);

    const { response } = await viewOnce(live, ada);
    // `resume_participant` failing used to be 401, "You have not joined this session", and a
    // failed read of the participant's own answer used to be a 200 with a blank form.
    expect(response.status).toBe(503);
    expect(logged).toHaveBeenCalledWith(
      "[live] a database call failed",
      expect.objectContaining({ route: "/api/live/view", call: named, sessionId: live.sessionId }),
    );
  });
});
