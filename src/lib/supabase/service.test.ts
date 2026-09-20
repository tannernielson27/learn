import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServiceClient, readSupabaseSecretKey } from "./service";

const createClient = vi.hoisted(() => vi.fn(() => ({ marker: "service client" })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

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

describe("createSupabaseServiceClient", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    createClient.mockClear();
  });

  it("builds a client on the project URL with the secret key, holding no session", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_abc";

    expect(createSupabaseServiceClient()).toEqual({ marker: "service client" });
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "sb_secret_abc", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it("never reaches Supabase without a secret key, rather than falling back to a weaker one", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    delete process.env.SUPABASE_SECRET_KEY;

    expect(() => createSupabaseServiceClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(createClient).not.toHaveBeenCalled();
  });
});
