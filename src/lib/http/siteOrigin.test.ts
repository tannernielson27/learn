import { describe, expect, it } from "vitest";
import { siteOrigin } from "./siteOrigin";

describe("siteOrigin", () => {
  it("prefers Origin, which a browser sets on every form post", () => {
    const headers = new Headers({
      origin: "https://learn.example",
      host: "somewhere.else",
      "x-forwarded-proto": "http",
    });
    expect(siteOrigin(headers)).toBe("https://learn.example");
  });

  it("falls back to the forwarded host and protocol behind a proxy", () => {
    const headers = new Headers({
      "x-forwarded-host": "learn-git-feat-129.vercel.app",
      "x-forwarded-proto": "https",
      host: "internal:3000",
    });
    expect(siteOrigin(headers)).toBe("https://learn-git-feat-129.vercel.app");
  });

  it("uses Host when nothing is in front of the server", () => {
    expect(siteOrigin(new Headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
  });

  it("has an answer even for a request that carries no host at all", () => {
    expect(siteOrigin(new Headers())).toBe("http://localhost:3000");
  });
});
