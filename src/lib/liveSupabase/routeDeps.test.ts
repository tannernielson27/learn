import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PARTICIPANT_COOKIE,
  formatParticipantToken,
  type ParticipantToken,
} from "@/lib/live/participantToken";
import type { Database } from "@/lib/supabase/database.types";
import { describeFault, participantFromCookie, unavailable } from "./routeDeps";

/**
 * The seam #133 closed: one identity for a participant, and it is #129's cookie.
 *
 * These are the decisions the verifier makes on its own, before any room is involved — what it
 * refuses without asking the database, what it refuses after asking, and that the bearer token
 * #131 shipped is not an identity any more.
 */

const TOKEN: ParticipantToken = {
  sessionId: "3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071",
  participantId: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  secret: "ab".repeat(24),
};

const RESUMED = [
  {
    participant_id: TOKEN.participantId,
    participant_name: "Sam Okafor",
    participant_joined_at: "2026-09-20T10:00:00.000Z",
    session_status: "running",
    session_mode: "instructor_paced",
    session_title: "Cardiac basics",
  },
];

const SIGNED_OUT = { ok: false, reason: "signed_out" };

/** `details` as postgrest-js writes them for a request that never got an answer. */
const NETWORK_DETAILS =
  "TypeError: fetch failed\n\nCaused by: Error: read ECONNRESET (ECONNRESET)\n" +
  "Error: read ECONNRESET\n    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)";

afterEach(() => {
  vi.restoreAllMocks();
});

function service(answer: { data: unknown; error: unknown; status?: number }) {
  const rpc = vi.fn(async () => answer);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const withCookie = (value: string) =>
  new Request("http://live.test/api/live/view", { method: "POST", headers: { cookie: value } });

describe("participantFromCookie", () => {
  it("is the participant the cookie names, once the database has agreed", async () => {
    const { client } = service({ data: RESUMED, error: null });
    const verified = await participantFromCookie(client)(
      withCookie(`${PARTICIPANT_COOKIE}=${formatParticipantToken(TOKEN)}`),
    );
    expect(verified).toEqual({
      ok: true,
      participant: { sessionId: TOKEN.sessionId, participantId: TOKEN.participantId },
    });
  });

  it("presents the token to resume_participant and nothing else", async () => {
    const { client, rpc } = service({ data: RESUMED, error: null });
    await participantFromCookie(client)(
      withCookie(`${PARTICIPANT_COOKIE}=${formatParticipantToken(TOKEN)}`),
    );
    expect(rpc).toHaveBeenCalledWith("resume_participant", {
      target_participant: TOKEN.participantId,
      target_session: TOKEN.sessionId,
      presented_secret: TOKEN.secret,
    });
  });

  it("refuses a request with no cookie, and never asks the database", async () => {
    const { client, rpc } = service({ data: RESUMED, error: null });
    const verify = participantFromCookie(client);
    expect(await verify(new Request("http://live.test/api/live/view", { method: "POST" }))).toEqual(
      SIGNED_OUT,
    );
    expect(await verify(withCookie("theme=dark"))).toEqual(SIGNED_OUT);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a cookie that could not be a token, without spending a round trip on it", async () => {
    const { client, rpc } = service({ data: RESUMED, error: null });
    const verify = participantFromCookie(client);
    for (const value of ["nonsense", "a.b.c", `${TOKEN.sessionId}.${TOKEN.participantId}.short`]) {
      expect(await verify(withCookie(`${PARTICIPANT_COOKIE}=${value}`))).toEqual(SIGNED_OUT);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a well-shaped token the database does not know", async () => {
    const { client } = service({ data: [], error: null });
    expect(
      await participantFromCookie(client)(
        withCookie(`${PARTICIPANT_COOKIE}=${formatParticipantToken(TOKEN)}`),
      ),
    ).toEqual(SIGNED_OUT);
  });

  // #407. This used to be null, the same answer as a token nobody holds, and every route turned
  // null into 401: a request that timed out told a phone it was not in the room.
  it("fails closed when the database will not answer, without calling it signed out", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = service({
      data: null,
      error: { message: "TypeError: fetch failed", code: "", details: NETWORK_DETAILS },
      status: 0,
    });
    expect(
      await participantFromCookie(client)(
        withCookie(`${PARTICIPANT_COOKIE}=${formatParticipantToken(TOKEN)}`),
      ),
    ).toEqual({ ok: false, reason: "unavailable" });

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[live] a database call failed", {
      route: "/api/live/view",
      call: "resume_participant",
      sessionId: TOKEN.sessionId,
      status: 0,
      code: null,
      message: "TypeError: fetch failed",
      cause: "Caused by: Error: read ECONNRESET (ECONNRESET)",
    });
    // The secret half of the token is the one thing in reach here that must never be written.
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN.secret);
  });

  it("does not accept the bearer token #131 shipped: there is one identity now, not two", async () => {
    const { client, rpc } = service({ data: RESUMED, error: null });
    const bearer = new Request("http://live.test/api/live/submit", {
      method: "POST",
      headers: { authorization: `Bearer ${formatParticipantToken(TOKEN)}` },
    });
    expect(await participantFromCookie(client)(bearer)).toEqual(SIGNED_OUT);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("what a failed call leaves in the log (#407)", () => {
  it("keeps a database error's code and message, and never its details", () => {
    // Postgres puts the failing row in `details`, and on these routes a row is a student's
    // answer or a display name.
    expect(
      describeFault({
        code: "23514",
        message: 'new row for relation "session_responses" violates check constraint "x"',
        details: 'Failing row contains (Sam Okafor, {"optionId": "opt_b"}).',
        hint: null,
      }),
    ).toEqual({
      code: "23514",
      message: 'new row for relation "session_responses" violates check constraint "x"',
      cause: null,
    });
  });

  it("keeps the socket error of a request that never arrived, without its stack", () => {
    expect(
      describeFault({ code: "", message: "TypeError: fetch failed", details: NETWORK_DETAILS }),
    ).toEqual({
      code: null,
      message: "TypeError: fetch failed",
      cause: "Caused by: Error: read ECONNRESET (ECONNRESET)",
    });
  });

  it("clips a long message, and copes with an error that is not an object", () => {
    expect(describeFault({ code: "XX000", message: "m".repeat(5_000) }).message).toHaveLength(300);
    expect(describeFault("boom")).toEqual({ code: null, message: "boom", cause: null });
    expect(describeFault(null)).toEqual({ code: null, message: "null", cause: null });
  });
});

describe("the answer to a call that did not come back (#407)", () => {
  it("is a 503 a client may retry, never cached", async () => {
    const response = unavailable();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "The session could not be reached. Try again.",
      retryable: true,
    });
  });
});
