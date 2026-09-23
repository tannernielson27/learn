import { createHmac, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_SESSION_CLAIM,
  CHANNEL_TOKEN_TTL_SECONDS,
  channelTokenClaims,
  mintChannelToken,
  readChannelSigningKey,
} from "./channelToken";

// The local stack's well-known JWT secret. Not a secret: every `supabase start` prints it.
const LOCAL_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const SESSION_A = "00000000-0000-4000-8000-00000000000a";
const SESSION_B = "00000000-0000-4000-8000-00000000000b";
const PARTICIPANT = "00000000-0000-4000-8000-0000000000aa";
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

function decode(token: string): {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
} {
  const [header, claims] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >,
    claims: JSON.parse(Buffer.from(claims, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >,
  };
}

/** A copy of a JWK with one member taken out. */
function without(jwk: string, member: string): string {
  const copy = JSON.parse(jwk) as Record<string, unknown>;
  delete copy[member];
  return JSON.stringify(copy);
}

function es256Jwk(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return JSON.stringify({ ...privateKey.export({ format: "jwk" }), kid: "test-kid" });
}

describe("channelTokenClaims", () => {
  it("names one participant in one session, as anon, for thirty minutes", () => {
    expect(channelTokenClaims({ sessionId: SESSION_A, participantId: PARTICIPANT }, 1000)).toEqual({
      role: "anon",
      sub: PARTICIPANT,
      [CHANNEL_SESSION_CLAIM]: SESSION_A,
      iat: 1000,
      exp: 1000 + CHANNEL_TOKEN_TTL_SECONDS,
    });
  });

  it("is never `authenticated`: the token narrows anon, it does not widen it", () => {
    expect(channelTokenClaims({ sessionId: SESSION_A, participantId: PARTICIPANT }, 0).role).toBe(
      "anon",
    );
  });
});

describe("readChannelSigningKey", () => {
  it("names the variable when it is missing", () => {
    expect(() => readChannelSigningKey(undefined)).toThrow(/SUPABASE_JWT_SIGNING_KEY is not set/);
    expect(() => readChannelSigningKey("   ")).toThrow(/SUPABASE_JWT_SIGNING_KEY is not set/);
  });

  it("refuses an API key pasted by mistake", () => {
    expect(() => readChannelSigningKey("sb_secret_0123456789abcdefghijklmnopqrstuv")).toThrow(
      /API key/,
    );
    expect(() => readChannelSigningKey("sb_publishable_0123456789abcdefghijklmnop")).toThrow(
      /API key/,
    );
  });

  it("refuses a secret too short to be a Supabase JWT secret", () => {
    expect(() => readChannelSigningKey("short")).toThrow(/too short/);
  });

  it("reads the legacy JWT secret as HS256", () => {
    expect(readChannelSigningKey(`  ${LOCAL_SECRET}  `)).toEqual({
      alg: "HS256",
      secret: LOCAL_SECRET,
    });
  });

  it("reads an imported ES256 private JWK", () => {
    const key = readChannelSigningKey(es256Jwk());
    expect(key.alg).toBe("ES256");
    expect(key.alg === "ES256" && key.kid).toBe("test-kid");
  });

  it("refuses a JWK that is not an ES256 private key, or has no kid", () => {
    expect(() => readChannelSigningKey("{not json")).toThrow(/not valid JSON/);
    expect(() => readChannelSigningKey(JSON.stringify({ kty: "RSA" }))).toThrow(/ES256/);
    expect(() => readChannelSigningKey(without(es256Jwk(), "kid"))).toThrow(/kid/);
    expect(() => readChannelSigningKey(without(es256Jwk(), "d"))).toThrow(/ES256/);
    expect(() =>
      readChannelSigningKey(
        JSON.stringify({ kty: "EC", crv: "P-256", d: "AAAA", x: "AAAA", y: "AAAA", kid: "k" }),
      ),
    ).toThrow(/not a usable/);
  });
});

describe("mintChannelToken", () => {
  it("signs HS256 with the secret, so Realtime verifying with the same secret accepts it", () => {
    const minted = mintChannelToken(
      { sessionId: SESSION_A, participantId: PARTICIPANT },
      readChannelSigningKey(LOCAL_SECRET),
      NOW,
    );
    const [header, claims, signature] = minted.token.split(".");
    const expected = createHmac("sha256", LOCAL_SECRET)
      .update(`${header}.${claims}`)
      .digest("base64url");
    expect(signature).toBe(expected);
    expect(decode(minted.token).header).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("signs ES256 with the kid Supabase knows the key by", () => {
    const jwk = es256Jwk();
    const minted = mintChannelToken(
      { sessionId: SESSION_A, participantId: PARTICIPANT },
      readChannelSigningKey(jwk),
      NOW,
    );
    const [header, claims, signature] = minted.token.split(".");
    expect(decode(minted.token).header).toEqual({ alg: "ES256", typ: "JWT", kid: "test-kid" });

    const publicKey = createPublicKey({
      key: JSON.parse(without(jwk, "d")) as never,
      format: "jwk",
    });
    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(ok).toBe(true);
  });

  it("carries the session it was minted for and no other, and says when it expires", () => {
    const key = readChannelSigningKey(LOCAL_SECRET);
    const forA = mintChannelToken({ sessionId: SESSION_A, participantId: PARTICIPANT }, key, NOW);
    const forB = mintChannelToken({ sessionId: SESSION_B, participantId: PARTICIPANT }, key, NOW);

    expect(decode(forA.token).claims[CHANNEL_SESSION_CLAIM]).toBe(SESSION_A);
    expect(decode(forB.token).claims[CHANNEL_SESSION_CLAIM]).toBe(SESSION_B);
    expect(forA.token).not.toBe(forB.token);
    expect(forA.expiresAt).toBe(NOW + CHANNEL_TOKEN_TTL_SECONDS * 1000);
  });

  it("carries nothing a participant could use against the Data API or the answer key", () => {
    const minted = mintChannelToken(
      { sessionId: SESSION_A, participantId: PARTICIPANT },
      readChannelSigningKey(LOCAL_SECRET),
      NOW,
    );
    expect(Object.keys(decode(minted.token).claims).sort()).toEqual(
      ["exp", "iat", CHANNEL_SESSION_CLAIM, "role", "sub"].sort(),
    );
  });
});
