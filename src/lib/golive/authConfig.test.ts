import { describe, expect, it, vi } from "vitest";
import {
  AUTH_CHECK_TITLES,
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
  disable_signup: true,
  password_min_length: 8,
  external_anonymous_users_enabled: false,
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
    expect(lines["auth-signup"]!.status).toBe("pass");
    expect(lines["auth-password"]!.status).toBe("pass");
    expect(lines["auth-anonymous"]!.status).toBe("pass");
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
    expect(lines["auth-signup"]!.status).toBe("fail");
    expect(lines["auth-password"]!.status).toBe("fail");
    expect(lines["auth-anonymous"]!.status).toBe("fail");
  });
});

describe("authConfigChecks: public sign-up and the password length (#359)", () => {
  it("prints the five lines in a fixed order, matching AUTH_CHECK_TITLES", () => {
    const lines = authConfigChecks(READY, SITE);
    expect(lines.map((line) => line.id)).toEqual([
      "auth-urls",
      "auth-template",
      "auth-signup",
      "auth-password",
      "auth-anonymous",
    ]);
    expect(AUTH_CHECK_TITLES.map(({ id, title }) => ({ id, title }))).toEqual(
      lines.map(({ id, title }) => ({ id, title })),
    );
  });

  it("fails while Supabase's own sign-up endpoint is open, and says where to close it", () => {
    const open = byId({ ...READY, disable_signup: false })["auth-signup"]!;
    expect(open.status).toBe("fail");
    expect(open.detail).toContain("Allow new users to sign up");
    expect(open.detail).toContain("§7.12 step 3");
  });

  it.each([undefined, null, "true", 1])(
    "fails a disable_signup of %j rather than reading it as closed",
    (value) => {
      expect(byId({ ...READY, disable_signup: value })["auth-signup"]!.status).toBe("fail");
    },
  );

  it.each([
    [8, "pass"],
    [12, "pass"],
    [7, "fail"],
    [6, "fail"],
    [0, "fail"],
    [8.5, "fail"],
    ["8", "fail"],
    [undefined, "fail"],
  ])("judges a minimum password length of %j as %s", (value, expected) => {
    const result = byId({ ...READY, password_min_length: value })["auth-password"]!;
    expect(result.status).toBe(expected);
    if (expected === "fail") expect(result.detail).toContain("§7.12 step 4");
  });

  it("names the length it found", () => {
    expect(byId({ ...READY, password_min_length: 6 })["auth-password"]!.detail).toContain("is 6");
    expect(byId({ ...READY, password_min_length: 10 })["auth-password"]!.detail).toContain("10");
  });
});

describe("authConfigChecks: anonymous sign-ins (#359)", () => {
  it("passes while anonymous sign-ins are off", () => {
    expect(byId(READY)["auth-anonymous"]).toMatchObject({
      status: "pass",
      title: "Supabase anonymous sign-ins are off",
    });
  });

  it("fails while they are on, and says where to turn them off", () => {
    const on = byId({ ...READY, external_anonymous_users_enabled: true })["auth-anonymous"]!;
    expect(on.status).toBe("fail");
    expect(on.detail).toContain("Allow anonymous sign-ins");
    expect(on.detail).toContain("§7.12 step 3");
  });

  it.each([undefined, null, "false", 0])(
    "fails an external_anonymous_users_enabled of %j rather than reading it as off",
    (value) => {
      const result = byId({ ...READY, external_anonymous_users_enabled: value })["auth-anonymous"]!;
      expect(result.status).toBe("fail");
    },
  );

  it("does not change the lines beside it", () => {
    const lines = byId({ ...READY, external_anonymous_users_enabled: true });
    expect(lines["auth-signup"]!.status).toBe("pass");
    expect(lines["auth-password"]!.status).toBe("pass");
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
