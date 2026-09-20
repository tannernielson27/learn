import { describe, expect, it } from "vitest";
import {
  bearerToken,
  participantFromRequest,
  readParticipantSecret,
  signParticipantToken,
  verifyParticipantToken,
} from "./participantToken";

const secret = "a-test-only-signing-secret-of-ample-length";
const who = { sessionId: "s-1", participantId: "p-1" };

describe("readParticipantSecret", () => {
  it("refuses a missing or short secret, naming the variable", () => {
    expect(() => readParticipantSecret(undefined)).toThrow("LIVE_PARTICIPANT_SECRET");
    expect(() => readParticipantSecret("  ")).toThrow("LIVE_PARTICIPANT_SECRET");
    expect(() => readParticipantSecret("short")).toThrow("32 characters");
    expect(readParticipantSecret(` ${secret} `)).toBe(secret);
  });
});

describe("the participant token", () => {
  it("round-trips the session and the participant, and nothing else", async () => {
    const token = await signParticipantToken(who, { secret });
    await expect(verifyParticipantToken(token, { secret })).resolves.toEqual(who);
  });

  it("carries nothing secret and nothing about the answers", async () => {
    const token = await signParticipantToken(who, { secret });
    const claims = atob((token.split(".")[1] as string).replace(/-/g, "+").replace(/_/g, "/"));
    expect(Object.keys(JSON.parse(claims) as object).sort()).toEqual(["e", "p", "s"]);
    expect(token).not.toContain(secret);
  });

  it("refuses a token signed with another key", async () => {
    const token = await signParticipantToken(who, { secret });
    await expect(
      verifyParticipantToken(token, { secret: `${secret}-but-different` }),
    ).resolves.toBeNull();
  });

  it("refuses a token whose claims were edited after signing", async () => {
    const token = await signParticipantToken(who, { secret });
    const [version, , signature] = token.split(".") as [string, string, string];
    const forged = btoa(JSON.stringify({ s: "s-1", p: "someone-else", e: Date.now() + 1_000 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(
      verifyParticipantToken(`${version}.${forged}.${signature}`, { secret }),
    ).resolves.toBeNull();
  });

  it("refuses an expired token", async () => {
    const token = await signParticipantToken(who, { secret, ttlMs: 1_000 });
    await expect(
      verifyParticipantToken(token, { secret, now: () => Date.now() + 2_000 }),
    ).resolves.toBeNull();
  });

  it("refuses nothing, gibberish, the wrong version and a truncated token", async () => {
    for (const bad of [null, undefined, "", "nonsense", "v2.a.b", "v1.onlytwo"]) {
      await expect(verifyParticipantToken(bad, { secret })).resolves.toBeNull();
    }
  });

  it("refuses a well-formed token whose claims are not a participant", async () => {
    const body = btoa(JSON.stringify({ s: 1, p: 2, e: Date.now() + 1_000 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    // Signed properly, so only the claims themselves can refuse it.
    const signed = await signParticipantToken(who, { secret });
    const resigned = `v1.${body}.${signed.split(".")[2] as string}`;
    await expect(verifyParticipantToken(resigned, { secret })).resolves.toBeNull();
  });
});

describe("bearerToken", () => {
  it("reads a bearer header and nothing else", () => {
    const of = (headers: Record<string, string>) =>
      bearerToken(new Request("http://live.test/x", { headers }));
    expect(of({ authorization: "Bearer abc" })).toBe("abc");
    expect(of({ authorization: "bearer abc" })).toBe("abc");
    expect(of({})).toBeNull();
    expect(of({ authorization: "Basic abc" })).toBeNull();
    expect(of({ authorization: "Bearer" })).toBeNull();
  });

  it("is what the default verifier reads", async () => {
    process.env.LIVE_PARTICIPANT_SECRET = secret;
    const token = await signParticipantToken(who, { secret });
    const request = new Request("http://live.test/x", {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(participantFromRequest(request)).resolves.toEqual(who);
    delete process.env.LIVE_PARTICIPANT_SECRET;
  });
});
