import { describe, expect, it } from "vitest";
import { linkOrigin, newToken, passLink, TOKEN_SHAPE, tokenHash } from "./token.mjs";

describe("newToken", () => {
  it("is 32 base64url characters: 24 random bytes, 192 bits", () => {
    const token = newToken();
    expect(token).toMatch(TOKEN_SHAPE);
    expect(Buffer.from(token, "base64url")).toHaveLength(24);
  });

  it("is new every time", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("tokenHash", () => {
  it("is the digest the database computes (private.org_invite_token_hash)", () => {
    // The same pair is asserted against the database in supabase/tests/database/beta_passes.test.sql.
    expect(tokenHash("fayfayfayfayfayfayfayfayfayfay01")).toBe(
      "e63faa31a58187e41d83eda9a4ac1786109dc2e9e9efd31981572b9d79844560",
    );
  });

  it("is 64 lower-case hex digits and never the token", () => {
    const token = newToken();
    expect(tokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(token)).not.toContain(token);
  });
});

describe("linkOrigin", () => {
  it("takes an https site address, to its origin", () => {
    expect(linkOrigin(" https://learnursing.app/ ")).toBe("https://learnursing.app");
    expect(linkOrigin("https://learnursing.app/some/path")).toBe("https://learnursing.app");
  });

  it("takes http only on this machine", () => {
    expect(linkOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(linkOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(linkOrigin("http://learnursing.app")).toBeNull();
  });

  it("refuses anything else", () => {
    for (const value of [
      undefined,
      "",
      "learnursing.app",
      "ftp://learnursing.app",
      "javascript:x",
    ]) {
      expect(linkOrigin(value)).toBeNull();
    }
  });
});

describe("passLink", () => {
  it("is the page's path on the origin", () => {
    expect(passLink("https://learnursing.app", "AbC_-0123456789abcdefghijklmnopq")).toBe(
      "https://learnursing.app/b/AbC_-0123456789abcdefghijklmnopq",
    );
  });
});
