import { describe, expect, it } from "vitest";
import { readSupabasePublicEnv } from "./env";

const url = "https://abcdefghijklmnopqrst.supabase.co";
const publishableKey = "sb_publishable_example";

describe("readSupabasePublicEnv", () => {
  it("returns the URL and publishable key when both are set", () => {
    expect(readSupabasePublicEnv({ url, publishableKey })).toEqual({ url, publishableKey });
  });

  it("trims stray whitespace from pasted values", () => {
    expect(
      readSupabasePublicEnv({ url: ` ${url}\n`, publishableKey: ` ${publishableKey} ` }),
    ).toEqual({
      url,
      publishableKey,
    });
  });

  it("names the missing URL variable", () => {
    expect(() => readSupabasePublicEnv({ url: undefined, publishableKey })).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("names the missing key variable", () => {
    expect(() => readSupabasePublicEnv({ url, publishableKey: "  " })).toThrow(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("rejects a URL that is not http(s)", () => {
    expect(() => readSupabasePublicEnv({ url: "vauokq.supabase.co", publishableKey })).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("allows plain http only for a local stack", () => {
    expect(readSupabasePublicEnv({ url: "http://127.0.0.1:54321", publishableKey }).url).toBe(
      "http://127.0.0.1:54321",
    );
    expect(() => readSupabasePublicEnv({ url: "http://example.com", publishableKey })).toThrow(
      "https",
    );
  });

  it("refuses a secret key in the public slot, because it would ship to the browser", () => {
    expect(() => readSupabasePublicEnv({ url, publishableKey: "sb_secret_abc" })).toThrow("secret");
  });

  it("refuses a legacy service_role JWT in the public slot", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    expect(() =>
      readSupabasePublicEnv({ url, publishableKey: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig` }),
    ).toThrow("secret");
  });
});
