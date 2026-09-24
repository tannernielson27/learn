import { describe, expect, it } from "vitest";
import { checkedSupabase, defaultSupabaseUrl, readOptions } from "./options.ts";

const REF = "abcdefghijklmnopqrst";

describe("readOptions", () => {
  it("reads a hosted run, ignoring pnpm's -- separator", () => {
    const options = readOptions(
      ["--", "--url", "https://site.example/some/path", "--project-ref", REF],
      { GOLIVE_HEALTH_TOKEN: " tok ", GOLIVE_PUBLISHABLE_KEY: "sb_publishable_env" },
    );
    expect(options).toEqual({
      help: false,
      siteUrl: "https://site.example",
      target: { kind: "hosted", ref: REF },
      supabaseUrl: null,
      publishableKey: "sb_publishable_env",
      healthToken: "tok",
    });
  });

  it("prefers the flag's publishable key and reads --local", () => {
    const options = readOptions(
      ["--url", "http://127.0.0.1:3000", "--local", "--publishable-key", "sb_publishable_flag"],
      {},
    );
    expect(options.target).toEqual({ kind: "local" });
    expect(options.publishableKey).toBe("sb_publishable_flag");
    expect(options.healthToken).toBeNull();
  });

  it("answers --help without other flags", () => {
    expect(readOptions(["--help"], {}).help).toBe(true);
  });

  it.each([
    [["--project-ref", REF], "--url is required"],
    [["--url", "nope", "--local"], "--url must be a URL"],
    [["--url", "ftp://x.example", "--local"], "--url must use https"],
    [["--url", "https://x.example"], "Pass --project-ref"],
    [["--url", "https://x.example", "--local", "--project-ref", REF], "not both"],
    [["--url", "https://x.example", "--project-ref", "ABC; rm -rf"], "20 lowercase"],
  ])("refuses %o", (argv, message) => {
    expect(() => readOptions(argv, {})).toThrow(message);
  });

  it("refuses an unknown flag, so a secret is never taken from one by mistake", () => {
    expect(() =>
      readOptions(["--url", "https://x.example", "--local", "--token", "x"], {}),
    ).toThrow();
  });
});

describe("checkedSupabase", () => {
  it("accepts https and a publishable key", () => {
    expect(checkedSupabase(`https://${REF}.supabase.co`, "sb_publishable_x")).toEqual({
      url: `https://${REF}.supabase.co`,
      publishableKey: "sb_publishable_x",
    });
  });

  it("allows a missing key, still checking the URL", () => {
    expect(checkedSupabase("http://127.0.0.1:55321", null).publishableKey).toBeNull();
    expect(() => checkedSupabase("http://evil.example", null)).toThrow("https");
  });

  it("refuses a secret key rather than send it anywhere", () => {
    expect(() => checkedSupabase(`https://${REF}.supabase.co`, "sb_secret_x")).toThrow(
      "secret key",
    );
  });
});

describe("defaultSupabaseUrl", () => {
  it("derives the hosted URL from the ref, and leaves the local one to the stack", () => {
    expect(defaultSupabaseUrl({ kind: "hosted", ref: REF })).toBe(`https://${REF}.supabase.co`);
    expect(defaultSupabaseUrl({ kind: "local" })).toBeNull();
  });
});
