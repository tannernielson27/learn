import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
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

describe("POST /api/live/view", () => {
  it("refuses a request carrying no participant", async () => {
    const response = await readParticipantView(jsonRequest(URL_VIEW, {}), deps({}, null));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("reports a database that will not answer, without saying what it said", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({ sessions: { data: null, error: { message: "connection refused" } } }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("connection refused");
  });

  it("treats a session that is no longer there as not being in a room", async () => {
    const response = await readParticipantView(jsonRequest(URL_VIEW, {}), deps({}));
    expect(response.status).toBe(401);
  });

  it("answers with no item at all while the room is in the lobby", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        sessions: {
          data: { status: "lobby", current_position: null, reveal: false, item_set: ["a", "b"] },
          error: null,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: { status: "lobby", position: null, itemCount: 2, reveal: false },
      item: null,
      answered: null,
      revealed: null,
    });
  });

  it("refuses to show an item whose stored JSON no longer validates", async () => {
    const response = await readParticipantView(
      jsonRequest(URL_VIEW, {}),
      deps({
        sessions: {
          data: { status: "running", current_position: 1, reveal: false, item_set: ["a"] },
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
