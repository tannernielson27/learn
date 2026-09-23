import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { validateItem } from "@/lib/ngn/validate";
import type { Database } from "@/lib/supabase/database.types";
import { toItemRow } from "@/lib/supabase/itemRows";
import type { LiveRouteDeps } from "./routeDeps";
import { submitSessionResponse } from "./submitRoute";
import { readParticipantView } from "./viewRoute";

/**
 * The refusals and faults the conformance suite cannot reach, because they are things a browser
 * does rather than things a room does: a forged request, an unreadable body, a rate limit, a
 * database that is not answering. Each is driven against the real handler with a scripted service
 * client, so what is under test is the handler's own decision.
 */

const ME = { sessionId: "s-1", participantId: "p-1" };
const URL_VIEW = "http://live.test/api/live/view";
const URL_SUBMIT = "http://live.test/api/live/submit";

type Answer = { data: unknown; error: unknown };

/** A service client that answers from a script: one entry per table read or function call. */
function scriptedService(script: Record<string, Answer>): SupabaseClient<Database> {
  const answer = (key: string): Answer => script[key] ?? { data: null, error: null };
  const client = {
    from(table: string) {
      return {
        select: () => {
          const builder = {
            eq: () => builder,
            maybeSingle: async () => answer(table),
          };
          return builder;
        },
      };
    },
    rpc: async (name: string) => answer(name),
  };
  return client as unknown as SupabaseClient<Database>;
}

function deps(script: Record<string, Answer>, verified: typeof ME | null = ME): LiveRouteDeps {
  return { verify: async () => verified, service: scriptedService(script) };
}

const jsonRequest = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function refusalOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { refusal?: string }).refusal;
}

/** The database's clock in these scripts (#182). */
const DB_NOW = "2027-01-15T08:00:00.000+00:00";

/** What `begin_session_view` answers with for a room in the state given (#152, #182). */
function viewing(state: {
  status: string;
  position: number | null;
  reveal: boolean;
  items: string[];
  seconds?: number | null;
  endsAt?: string | null;
  remainingMs?: number | null;
  serverNow?: string;
}): Answer {
  return {
    data: [
      {
        refusal: null,
        session_status: state.status,
        session_position: state.position,
        session_reveal: state.reveal,
        session_items: state.items,
        session_timer_seconds: state.seconds ?? null,
        session_ends_at: state.endsAt ?? null,
        session_remaining_ms: state.remainingMs ?? null,
        server_now: state.serverNow ?? DB_NOW,
      },
    ],
    error: null,
  };
}

describe("POST /api/live/view", () => {
  it("refuses anything that is not JSON, the same way the submission route does", async () => {
    const response = await readParticipantView(
      new Request(URL_VIEW, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "text/plain" },
      }),
      deps({}),
    );
    expect(await refusalOf(response)).toBe("malformed");
  });

  it("refuses a request carrying no participant", async () => {
    const response = await readParticipantView(jsonRequest(URL_VIEW, {}), deps({}, null));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("reports a database that will not answer, without saying what it said", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({ begin_session_view: { data: null, error: { message: "connection refused" } } }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("connection refused");
  });

  it("treats a session that is no longer there as not being in a room", async () => {
    const response = await readParticipantView(jsonRequest(URL_VIEW, {}), deps({}));
    expect(response.status).toBe(401);
  });

  it("passes the rate limiter's refusal on as one, with the status a client can back off on", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        begin_session_view: {
          data: [
            {
              refusal: "rate_limited",
              session_status: null,
              session_position: null,
              session_reveal: null,
              session_items: null,
            },
          ],
          error: null,
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(await refusalOf(response)).toBe("rate_limited");
  });

  it("treats an unrecognised refusal code as a fault, not as a room to draw", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        begin_session_view: {
          data: [
            {
              refusal: "something_new",
              session_status: null,
              session_position: null,
              session_reveal: null,
              session_items: null,
            },
          ],
          error: null,
        },
      }),
    );
    // A refused call answers with nulls in every other column, so carrying on would put a null
    // status on a phone. Never passed through as itself either: it would be an empty sentence.
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("something_new");
  });

  it("answers with no item at all while the room is in the lobby", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        begin_session_view: viewing({
          status: "lobby",
          position: null,
          reveal: false,
          items: ["a", "b"],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: {
        status: "lobby",
        position: null,
        itemCount: 2,
        reveal: false,
        timer: { seconds: null, endsAt: null, remainingMs: null },
      },
      item: null,
      answered: null,
      revealed: null,
      serverNow: Date.parse(DB_NOW),
    });
  });

  it("carries the item's clock and the database's own time (#182)", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        begin_session_view: viewing({
          status: "paused",
          position: null,
          reveal: false,
          items: ["a"],
          seconds: 60,
          remainingMs: 21_500,
        }),
      }),
    );
    const body = (await response.json()) as { state: { timer: unknown }; serverNow: number };
    expect(body.state.timer).toEqual({ seconds: 60, endsAt: null, remainingMs: 21_500 });
    expect(body.serverNow).toBe(Date.parse(DB_NOW));
  });

  it("treats a clock it cannot read as a fault, not as a room without one", async () => {
    for (const broken of [{ endsAt: "whenever" }, { serverNow: "whenever" }]) {
      const response = await readParticipantView(
        jsonRequest(URL_VIEW, {}),
        deps({
          begin_session_view: viewing({
            status: "running",
            position: null,
            reveal: false,
            items: [],
            ...broken,
          }),
        }),
      );
      expect(response.status).toBe(500);
    }
  });

  it("refuses to show an item whose stored JSON no longer validates", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        begin_session_view: viewing({
          status: "running",
          position: 1,
          reveal: false,
          items: ["a"],
        }),
        items: {
          data: {
            type: "multiple_choice",
            cjmm_step: null,
            tags: [],
            version: 1,
            content: { id: "broken" },
            answer_key: {},
            rationale: {},
            scoring: {},
          },
          error: null,
        },
      }),
    );
    expect(response.status).toBe(409);
  });

  it("does not hand back an answer whose stored timestamp will not parse", async () => {
    const item = validateItem(FIXTURES.multiple_choice.canonical);
    if (!item.ok) throw new Error("the multiple_choice fixture no longer validates");
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        begin_session_view: viewing({
          status: "running",
          position: 1,
          reveal: false,
          items: ["a"],
        }),
        items: { data: toItemRow(item.value), error: null },
        // `Date.parse` of this is NaN, which serializes to null: an answer that claims never to
        // have been sent. It reads as "not answered here" instead.
        session_responses: {
          data: {
            response: FIXTURES.multiple_choice.cases[0].response,
            submitted_at: "not a timestamp",
          },
          error: null,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { answered: unknown }).answered).toBeNull();
  });
});

describe("POST /api/live/submit", () => {
  const running = {
    sessions: {
      data: { status: "running", current_position: 1, reveal: false, item_set: ["a"] },
      error: null,
    },
  };

  it("refuses anything that is not JSON, so no cross-site form post reaches the scorer", async () => {
    const response = await submitSessionResponse(
      new Request(URL_SUBMIT, {
        method: "POST",
        body: "itemId=x",
        headers: { "content-type": "text/plain" },
      }),
      deps(running),
    );
    expect(await refusalOf(response)).toBe("malformed");
  });

  it("refuses a request carrying no participant", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps(running, null),
    );
    expect(response.status).toBe(401);
    expect(await refusalOf(response)).toBe("not_joined");
  });

  it("refuses a body that declares itself enormous before reading it", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }, { "content-length": "99999999" }),
      deps(running),
    );
    expect(response.status).toBe(413);
  });

  it("refuses a body that is not readable JSON, an array, or one with no item", async () => {
    for (const body of ["{oops", [1, 2], { response: {} }, { itemId: 7, response: {} }]) {
      const response = await submitSessionResponse(jsonRequest(URL_SUBMIT, body), deps(running));
      expect(await refusalOf(response)).toBe("malformed");
    }
  });

  it("passes the rate limiter's refusal on as one, with the status a client can back off on", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps({
        begin_session_submission: {
          data: [{ refusal: "rate_limited", item_position: null, item_id: null }],
          error: null,
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(await refusalOf(response)).toBe("rate_limited");
  });

  it("refuses an answer whose time is up with its own code, before scoring it (#182)", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps({
        begin_session_submission: {
          data: [{ refusal: "time_up", item_position: null, item_id: null }],
          error: null,
        },
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ refusal: "time_up", error: "Time is up." });
  });

  it("refuses one whose time ran out while it was being scored, at the write (#182)", async () => {
    const item = validateItem(FIXTURES.multiple_choice.canonical);
    if (!item.ok) throw new Error("fixture");
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, {
        itemId: item.value.id,
        response: { type: "multiple_choice", optionId: "opt_a" },
      }),
      deps({
        begin_session_submission: {
          data: [{ refusal: null, item_position: 1, item_id: "row-1" }],
          error: null,
        },
        items: { data: toItemRow(item.value), error: null },
        record_session_response: {
          data: [{ refusal: "time_up", submitted_at: null }],
          error: null,
        },
      }),
    );
    expect(response.status).toBe(409);
    expect(await refusalOf(response)).toBe("time_up");
  });

  it("refuses an answer to an item the room is not on", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps({
        begin_session_submission: {
          data: [{ refusal: null, item_position: null, item_id: null }],
          error: null,
        },
      }),
    );
    expect(await refusalOf(response)).toBe("wrong_item");
  });

  it("reports a function that failed rather than pretending the answer was taken", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps({ begin_session_submission: { data: null, error: { message: "boom" } } }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("boom");
  });

  it("treats an unrecognised refusal code as a fault, not as something to show a student", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps({
        begin_session_submission: {
          data: [{ refusal: "something_new", item_position: null, item_id: null }],
          error: null,
        },
      }),
    );
    // Never passed through as itself: an unknown code would reach a person as an empty sentence.
    expect(await response.text()).not.toContain("something_new");
  });

  it("refuses to score an item whose stored JSON no longer validates", async () => {
    const response = await submitSessionResponse(
      jsonRequest(URL_SUBMIT, { itemId: "x", response: {} }),
      deps({
        begin_session_submission: {
          data: [{ refusal: null, item_position: 1, item_id: "a" }],
          error: null,
        },
        items: {
          data: {
            type: "multiple_choice",
            cjmm_step: null,
            tags: [],
            version: 1,
            content: { id: "broken" },
            answer_key: {},
            rationale: {},
            scoring: {},
          },
          error: null,
        },
      }),
    );
    expect(response.status).toBe(409);
  });
});
