import { describe, expect, it } from "vitest";
import { canonicalSiteOrigin, siteOrigin } from "./siteOrigin";

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

describe("canonicalSiteOrigin", () => {
  const forged = new Headers({ origin: "https://attacker.example", host: "attacker.example" });

  it("uses the production domain Vercel sets, whatever the request claims", () => {
    const env = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "learn-tanner-nielsons-projects.vercel.app",
      VERCEL_URL: "learn-abc123-tanner-nielsons-projects.vercel.app",
    };
    expect(canonicalSiteOrigin(forged, env)).toBe(
      "https://learn-tanner-nielsons-projects.vercel.app",
    );
  });

  it("uses the deployment's own address on a preview", () => {
    const env = {
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "learn-tanner-nielsons-projects.vercel.app",
      VERCEL_URL: "learn-abc123-tanner-nielsons-projects.vercel.app",
    };
    expect(canonicalSiteOrigin(forged, env)).toBe(
      "https://learn-abc123-tanner-nielsons-projects.vercel.app",
    );
  });

  it("prefers SITE_URL in production, which Supabase's allow-list names (#304)", () => {
    const env = {
      VERCEL_ENV: "production",
      SITE_URL: "https://learn.example/",
      VERCEL_PROJECT_PRODUCTION_URL: "learn-nine-alpha.vercel.app",
      VERCEL_URL: "learn-abc123-tanner-nielsons-projects.vercel.app",
    };
    expect(canonicalSiteOrigin(forged, env)).toBe("https://learn.example");
  });

  it("keeps only the origin of SITE_URL, so a stray path cannot reach a link", () => {
    const env = { VERCEL_ENV: "production", SITE_URL: " https://learn.example/auth/confirm?x=1 " };
    expect(canonicalSiteOrigin(forged, env)).toBe("https://learn.example");
  });

  it.each(["learn.example", "http://learn.example", "not a url", ""])(
    "ignores a SITE_URL that is not an https URL (%j) and uses Vercel's domain",
    (SITE_URL) => {
      const env = {
        VERCEL_ENV: "production",
        SITE_URL,
        VERCEL_PROJECT_PRODUCTION_URL: "learn-nine-alpha.vercel.app",
      };
      expect(canonicalSiteOrigin(forged, env)).toBe("https://learn-nine-alpha.vercel.app");
    },
  );

  it("ignores SITE_URL on a preview, whose links stay on the preview", () => {
    const env = {
      VERCEL_ENV: "preview",
      SITE_URL: "https://learn.example",
      VERCEL_URL: "learn-abc123-tanner-nielsons-projects.vercel.app",
    };
    expect(canonicalSiteOrigin(forged, env)).toBe(
      "https://learn-abc123-tanner-nielsons-projects.vercel.app",
    );
  });

  it("falls back to the request only off Vercel, as in local development", () => {
    const local = new Headers({ host: "localhost:3000" });
    expect(canonicalSiteOrigin(local, {})).toBe("http://localhost:3000");
  });
});
