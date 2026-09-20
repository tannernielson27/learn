import { describe, expect, it } from "vitest";
import { readSupabaseSecretKey } from "./service";

describe("readSupabaseSecretKey", () => {
  it("returns the key, trimmed", () => {
    expect(readSupabaseSecretKey({ secretKey: "  sb_secret_abc  " })).toBe("sb_secret_abc");
  });

  it("names the variable when it is missing, rather than failing later at the database", () => {
    expect(() => readSupabaseSecretKey({ secretKey: undefined })).toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => readSupabaseSecretKey({ secretKey: "   " })).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("refuses a publishable key, which would be silently unable to resolve a code", () => {
    expect(() => readSupabaseSecretKey({ secretKey: "sb_publishable_abc" })).toThrow(/publishable/);
  });
});
