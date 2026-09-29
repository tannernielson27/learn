import { describe, expect, it, vi } from "vitest";
import {
  AUTH_CONFIG_URL,
  allowListMatches,
  authConfigChecks,
  readAuthConfig,
  type AuthConfig,
} from "./authConfig.ts";

const SITE = "https://learn.example";
const TEMPLATE =
  '<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a><p>{{ .Token }}</p>';

const READY: AuthConfig = {
  site_url: SITE,
  uri_allow_list: `${SITE}/**,https://learn-*-team.vercel.app/**,http://localhost:3000/**`,
  mailer_templates_magic_link_content: TEMPLATE,
  mailer_otp_length: 6,
};

const byId = (config: AuthConfig) =>
  Object.fromEntries(authConfigChecks(config, SITE).map((line) => [line.id, line]));

describe("allowListMatches (#307)", () => {
  it.each([
    [`${SITE}/**`, true],
    [`${SITE}/auth/confirm`, false],
    // GoTrue matches the whole URL, query included, and `*` stops only at "." and "/".
    [`${SITE}/auth/*`, true],
    ["https://learn.example/*/*", true],
    ["https://learn.example/*", false],
    ["https://*.example/**", true],
    ["https://other.example/**", false],
    ["https://learn.example.evil/**", false],
  ])("treats %j as %s for a confirm link with its query", (entry, expected) => {
    expect(allowListMatches(entry, `${SITE}/auth/confirm?next=%2Flearn`)).toBe(expected);
  });

  it("keeps a single star inside one host label or path segment", () => {
    expect(allowListMatches("https://*.vercel.app/**", "https://a.b.vercel.app/x")).toBe(false);
    expect(
      allowListMatches("https://learn-*-team.vercel.app/**", "https://learn-x1-team.vercel.app/c"),
    ).toBe(true);
  });
});

describe("authConfigChecks (#307)", () => {
  it("passes a project whose Site URL, allow-list and template fit the site", () => {
    const lines = byId(READY);
    expect(lines["auth-urls"]!.status).toBe("pass");
    expect(lines["auth-template"]!.status).toBe("pass");
  });

  it("fails a Site URL that is not the site: where Supabase sends a refused redirect", () => {
    const lines = byId({ ...READY, site_url: "https://learn-old.vercel.app" });
    expect(lines["auth-urls"]).toMatchObject({ status: "fail" });
    expect(lines["auth-urls"]!.detail).toContain("https://learn-old.vercel.app");
    expect(lines["auth-urls"]!.detail).toContain("§7.7 step 5");
  });

  it("fails an allow-list that does not admit the site's confirm link: the #304 failure", () => {
    const lines = byId({ ...READY, uri_allow_list: "https://learn-old.vercel.app/**" });
    expect(lines["auth-urls"]).toMatchObject({ status: "fail" });
    expect(lines["auth-urls"]!.detail).toContain(`${SITE}/**`);
  });

  it("fails a template without the token-hash link or the code, and names what is missing", () => {
    const noCode = byId({
      ...READY,
      mailer_templates_magic_link_content: TEMPLATE.replace("{{ .Token }}", ""),
    });
    expect(noCode["auth-template"]).toMatchObject({ status: "fail" });
    expect(noCode["auth-template"]!.detail).toContain("{{ .Token }}");
    const noLink = byId({ ...READY, mailer_templates_magic_link_content: "<p>{{ .Token }}</p>" });
    expect(noLink["auth-template"]!.detail).toContain("token_hash");
  });

  it("fails a code length the app does not accept", () => {
    expect(byId({ ...READY, mailer_otp_length: 4 })["auth-template"]).toMatchObject({
      status: "fail",
    });
  });

  it("fails fields that are missing rather than guessing", () => {
    const lines = byId({});
    expect(lines["auth-urls"]!.status).toBe("fail");
    expect(lines["auth-template"]!.status).toBe("fail");
  });
});

describe("readAuthConfig (#307)", () => {
  it("reads the project's auth config with the token as a bearer, and nothing else", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(READY), { status: 200 }));
    expect(await readAuthConfig(fetchImpl, "abcdefghijklmnopqrst", "sbp_secret")).toEqual(READY);
    expect(fetchImpl).toHaveBeenCalledWith(AUTH_CONFIG_URL("abcdefghijklmnopqrst"), {
      headers: { Authorization: "Bearer sbp_secret" },
      redirect: "error",
    });
  });

  it("throws the status, never the body, when the API refuses", async () => {
    const fetchImpl = vi.fn(async () => new Response("token sbp_leak is bad", { status: 401 }));
    await expect(readAuthConfig(fetchImpl, "abcdefghijklmnopqrst", "sbp_x")).rejects.toThrow(
      /^HTTP 401 from the Supabase Management API/,
    );
    await expect(readAuthConfig(fetchImpl, "abcdefghijklmnopqrst", "sbp_x")).rejects.not.toThrow(
      /sbp_leak/,
    );
  });
});
