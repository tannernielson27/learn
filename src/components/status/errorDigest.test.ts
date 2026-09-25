import { describe, expect, it } from "vitest";
import { errorDigest } from "./errorDigest";

function withDigest(digest: unknown): Error {
  return Object.assign(new Error("secret message"), { digest });
}

describe("errorDigest", () => {
  it("reads the digest Next puts on a server error", () => {
    expect(errorDigest(withDigest("2718281828"))).toBe("2718281828");
    expect(errorDigest(withDigest("NEXT_HTTP_ERROR_FALLBACK;404"))).toBeUndefined();
  });

  it.each([
    ["no digest", new Error("secret message")],
    ["a non-string digest", withDigest(42)],
    ["an empty digest", withDigest("")],
    ["a digest that is really a sentence", withDigest("relation private.x does not exist")],
    ["a digest too long to be a hash", withDigest("a".repeat(65))],
    ["something that is not an error", "a thrown string"],
    ["null", null],
  ])("gives nothing for %s", (_, error) => {
    expect(errorDigest(error)).toBeUndefined();
  });
});
