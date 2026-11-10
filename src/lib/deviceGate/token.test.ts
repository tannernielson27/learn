import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  fromBase64Url,
  randomToken,
  sha256Hex,
  signToken,
  toBase64Url,
  verifyToken,
} from "./token";

const SECRET = "a".repeat(40);
const NOW = 1_800_000_000;

describe("base64url", () => {
  it("round-trips bytes, including the ones that need - and _", () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1, 2]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it("refuses text that is not base64url", () => {
    expect(fromBase64Url("not base64!")).toBeNull();
    expect(fromBase64Url("abc+")).toBeNull();
  });
});

describe("signed tokens", () => {
  const session = { k: "session", d: "device-1", exp: NOW + 60 } as const;

  it("verifies a session it signed", async () => {
    const token = await signToken(session, SECRET);
    expect(await verifyToken(token, SECRET, "session", NOW)).toEqual(session);
  });

  it("refuses another secret, an edited payload, and an expired token", async () => {
    const token = await signToken(session, SECRET);
    expect(await verifyToken(token, "b".repeat(40), "session", NOW)).toBeNull();

    const [, signature] = token.split(".");
    const forged = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ ...session, d: "other" })),
    );
    expect(await verifyToken(`${forged}.${signature}`, SECRET, "session", NOW)).toBeNull();

    expect(await verifyToken(token, SECRET, "session", NOW + 60)).toBeNull();
  });

  it("never accepts a challenge as a session, or a session as a challenge", async () => {
    const challenge = await signToken(
      { k: "challenge", purpose: "unlock", ch: "abc", exp: NOW + 60 },
      SECRET,
    );
    expect(await verifyToken(challenge, SECRET, "session", NOW)).toBeNull();
    expect(await verifyToken(challenge, SECRET, "challenge", NOW)).not.toBeNull();
    const token = await signToken(session, SECRET);
    expect(await verifyToken(token, SECRET, "challenge", NOW)).toBeNull();
  });

  it("refuses garbage, a missing token, and a well-signed payload of the wrong shape", async () => {
    expect(await verifyToken(null, SECRET, "session", NOW)).toBeNull();
    expect(await verifyToken("", SECRET, "session", NOW)).toBeNull();
    expect(await verifyToken("one.two.three", SECRET, "session", NOW)).toBeNull();
    expect(await verifyToken("abc.!!!", SECRET, "session", NOW)).toBeNull();

    const noDevice = await signToken({ k: "session", d: "", exp: NOW + 60 }, SECRET);
    expect(await verifyToken(noDevice, SECRET, "session", NOW)).toBeNull();
    const badPurpose = await signToken(
      { k: "challenge", purpose: "other" as "unlock", ch: "abc", exp: NOW + 60 },
      SECRET,
    );
    expect(await verifyToken(badPurpose, SECRET, "challenge", NOW)).toBeNull();
  });
});

describe("helpers", () => {
  it("hashes to 64 hex digits", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("compares strings", async () => {
    expect(await constantTimeEqual("same", "same")).toBe(true);
    expect(await constantTimeEqual("same", "diff")).toBe(false);
    expect(await constantTimeEqual("short", "a much longer string")).toBe(false);
  });

  it("makes distinct 43-character tokens", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });
});
