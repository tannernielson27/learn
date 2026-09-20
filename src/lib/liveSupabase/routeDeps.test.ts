import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  PARTICIPANT_COOKIE,
  formatParticipantToken,
  type ParticipantToken,
} from "@/lib/live/participantToken";
import type { Database } from "@/lib/supabase/database.types";
import { participantFromCookie } from "./routeDeps";

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

function service(answer: { data: unknown; error: unknown }) {
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
      sessionId: TOKEN.sessionId,
      participantId: TOKEN.participantId,
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
    expect(await verify(new Request("http://live.test/api/live/view", { method: "POST" }))).toBe(
      null,
    );
    expect(await verify(withCookie("theme=dark"))).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a cookie that could not be a token, without spending a round trip on it", async () => {
    const { client, rpc } = service({ data: RESUMED, error: null });
    const verify = participantFromCookie(client);
    for (const value of ["nonsense", "a.b.c", `${TOKEN.sessionId}.${TOKEN.participantId}.short`]) {
      expect(await verify(withCookie(`${PARTICIPANT_COOKIE}=${value}`))).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a well-shaped token the database does not know", async () => {
    const { client } = service({ data: [], error: null });
    expect(
      await participantFromCookie(client)(
        withCookie(`${PARTICIPANT_COOKIE}=${formatParticipantToken(TOKEN)}`),
      ),
    ).toBeNull();
  });

  it("fails closed when the database will not answer", async () => {
    const { client } = service({ data: null, error: { message: "connection refused" } });
    expect(
      await participantFromCookie(client)(
        withCookie(`${PARTICIPANT_COOKIE}=${formatParticipantToken(TOKEN)}`),
      ),
    ).toBeNull();
  });

  it("does not accept the bearer token #131 shipped: there is one identity now, not two", async () => {
    const { client, rpc } = service({ data: RESUMED, error: null });
    const bearer = new Request("http://live.test/api/live/submit", {
      method: "POST",
      headers: { authorization: `Bearer ${formatParticipantToken(TOKEN)}` },
    });
    expect(await participantFromCookie(client)(bearer)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
