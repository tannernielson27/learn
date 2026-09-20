import { describe, expect, it } from "vitest";
import {
  formatParticipantToken,
  PARTICIPANT_COOKIE,
  PARTICIPANT_COOKIE_MAX_AGE_SECONDS,
  participantCookieOptions,
  parseParticipantToken,
  type ParticipantToken,
} from "./participantToken";

const SESSION = "3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071";
const PARTICIPANT = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SECRET = "a".repeat(48);

const TOKEN: ParticipantToken = {
  sessionId: SESSION,
  participantId: PARTICIPANT,
  secret: SECRET,
};

describe("formatParticipantToken", () => {
  it("writes the session, the participant and the secret in that order", () => {
    expect(formatParticipantToken(TOKEN)).toBe(`${SESSION}.${PARTICIPANT}.${SECRET}`);
  });

  it("round-trips through the parser", () => {
    expect(parseParticipantToken(formatParticipantToken(TOKEN))).toEqual(TOKEN);
  });
});

describe("parseParticipantToken", () => {
  it("reads a well-formed token", () => {
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}.${SECRET}`)).toEqual(TOKEN);
  });

  it("accepts an upper-case uuid, which is the same uuid", () => {
    const shouted = parseParticipantToken(`${SESSION.toUpperCase()}.${PARTICIPANT}.${SECRET}`);
    expect(shouted?.sessionId).toBe(SESSION.toUpperCase());
  });

  it("returns null for a missing cookie", () => {
    expect(parseParticipantToken(undefined)).toBeNull();
    expect(parseParticipantToken(null)).toBeNull();
    expect(parseParticipantToken("")).toBeNull();
  });

  it("returns null for anything that is not three parts", () => {
    expect(parseParticipantToken(SESSION)).toBeNull();
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}`)).toBeNull();
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}.${SECRET}.extra`)).toBeNull();
  });

  it("returns null when either id is not a uuid", () => {
    expect(parseParticipantToken(`not-a-uuid.${PARTICIPANT}.${SECRET}`)).toBeNull();
    expect(parseParticipantToken(`${SESSION}.not-a-uuid.${SECRET}`)).toBeNull();
  });

  it("returns null when the secret is the wrong length or not hex", () => {
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}.${"a".repeat(47)}`)).toBeNull();
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}.${"a".repeat(49)}`)).toBeNull();
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}.${"z".repeat(48)}`)).toBeNull();
  });

  it("is the shape check only: a well-formed token is not a valid one", () => {
    // Nothing here has been anywhere near the database. `resume_participant` is what says yes.
    expect(parseParticipantToken(`${SESSION}.${PARTICIPANT}.${"0".repeat(48)}`)).not.toBeNull();
  });
});

describe("participantCookieOptions", () => {
  it("is httpOnly, same-site lax, site-wide, and expires with the class", () => {
    expect(participantCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: PARTICIPANT_COOKIE_MAX_AGE_SECONDS,
    });
  });

  it("leaves Secure to the caller, because a local run is served over plain http", () => {
    expect(participantCookieOptions(false).secure).toBe(false);
  });

  it("takes a shorter life when one is asked for", () => {
    expect(participantCookieOptions(true, 60).maxAge).toBe(60);
  });
});

describe("PARTICIPANT_COOKIE", () => {
  it("is one cookie, so joining a new room replaces the old one", () => {
    expect(PARTICIPANT_COOKIE).toBe("learn_participant");
  });
});
