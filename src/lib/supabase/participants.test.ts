import { describe, expect, it, vi } from "vitest";
import type { ParticipantToken } from "@/lib/live/participantToken";
import { joinSession, resumeParticipant } from "./participants";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };

/** The same partial-mock shape `sessions.test.ts` uses, cast to the parameter's own type. */
type Client = Parameters<typeof joinSession>[0];

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const SESSION = "3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071";
const PARTICIPANT = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SECRET = "a".repeat(48);

const TOKEN: ParticipantToken = {
  sessionId: SESSION,
  participantId: PARTICIPANT,
  secret: SECRET,
};

describe("joinSession", () => {
  it("creates the participant and hands back the secret half of the token", async () => {
    const fake = fakeRpc({
      data: [{ participant_id: PARTICIPANT, rejoin_secret: SECRET }],
      error: null,
    });

    expect(await joinSession(fake.client, SESSION, "Sam Okafor")).toEqual({
      ok: true,
      participant: { participantId: PARTICIPANT, secret: SECRET },
    });
    expect(fake.rpc).toHaveBeenCalledWith("join_session", {
      target_session: SESSION,
      chosen_name: "Sam Okafor",
    });
  });

  it("reads a session that is not there as gone", async () => {
    const fake = fakeRpc({ error: { code: "P0002" } });
    expect(await joinSession(fake.client, SESSION, "Sam")).toEqual({ ok: false, reason: "gone" });
  });

  it("reads a session closed between resolving the code and joining as ended", async () => {
    const fake = fakeRpc({ error: { code: "22023" } });
    expect(await joinSession(fake.client, SESSION, "Sam")).toEqual({ ok: false, reason: "ended" });
  });

  it("reads the roster ceiling as full, which is the one refusal with its own message", async () => {
    const fake = fakeRpc({ error: { code: "54000" } });
    expect(await joinSession(fake.client, SESSION, "Sam")).toEqual({ ok: false, reason: "full" });
  });

  it("fails rather than guessing when the call breaks or answers with nothing", async () => {
    expect(await joinSession(fakeRpc({ error: { code: "08006" } }).client, SESSION, "Sam")).toEqual(
      { ok: false, reason: "failed" },
    );
    expect(await joinSession(fakeRpc({ data: [], error: null }).client, SESSION, "Sam")).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("resumeParticipant", () => {
  it("brings back the participant and their session's state", async () => {
    const fake = fakeRpc({
      data: [
        {
          participant_id: PARTICIPANT,
          participant_name: "Sam Okafor",
          session_status: "lobby",
          session_mode: "instructor_paced",
          session_title: "Cardiac bank",
        },
      ],
      error: null,
    });

    expect(await resumeParticipant(fake.client, TOKEN)).toEqual({
      participantId: PARTICIPANT,
      displayName: "Sam Okafor",
      sessionStatus: "lobby",
      mode: "instructor_paced",
      title: "Cardiac bank",
    });
    expect(fake.rpc).toHaveBeenCalledWith("resume_participant", {
      target_participant: PARTICIPANT,
      target_session: SESSION,
      presented_secret: SECRET,
    });
  });

  it("returns nothing an unknown, tampered or foreign token can be told apart by", async () => {
    expect(await resumeParticipant(fakeRpc({ data: [], error: null }).client, TOKEN)).toBeNull();
    expect(await resumeParticipant(fakeRpc({ data: null, error: null }).client, TOKEN)).toBeNull();
  });

  it("fails closed: a database that cannot answer is not a reason to let someone in", async () => {
    const fake = fakeRpc({ error: { code: "08006" } });
    expect(await resumeParticipant(fake.client, TOKEN)).toBeNull();
  });

  it("returns a name and a session, and never an item, a set or a key (ADR 0003)", async () => {
    const fake = fakeRpc({
      data: [
        {
          participant_id: PARTICIPANT,
          participant_name: "Sam",
          session_status: "running",
          session_mode: "student_paced",
          session_title: "Cardiac bank",
        },
      ],
      error: null,
    });

    const resumed = await resumeParticipant(fake.client, TOKEN);
    expect(Object.keys(resumed ?? {}).sort()).toEqual([
      "displayName",
      "mode",
      "participantId",
      "sessionStatus",
      "title",
    ]);
    expect(JSON.stringify(resumed)).not.toMatch(/answer|item_set|rationale|scoring/i);
  });
});
