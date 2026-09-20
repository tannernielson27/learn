import { describe, expect, it } from "vitest";
import { supabaseProjectRef } from "./projectRef";

describe("supabaseProjectRef", () => {
  it("names the hosted project by its ref", () => {
    expect(supabaseProjectRef("https://vauokqoyvewtzubqajgh.supabase.co")).toBe(
      "vauokqoyvewtzubqajgh",
    );
  });

  it("ignores a trailing slash, a path, a port and letter case", () => {
    expect(supabaseProjectRef("https://VAUOKQOYVEWTZUBQAJGH.supabase.co:443/rest/v1/")).toBe(
      "vauokqoyvewtzubqajgh",
    );
  });

  it("reads the ref from the other hosted domain", () => {
    expect(supabaseProjectRef("https://abcdefghijklmnopqrst.supabase.in")).toBe(
      "abcdefghijklmnopqrst",
    );
  });

  it("calls the local stack local rather than inventing a ref", () => {
    expect(supabaseProjectRef("http://127.0.0.1:55321")).toBe("local");
    expect(supabaseProjectRef("http://localhost:55321")).toBe("local");
    expect(supabaseProjectRef("http://[::1]:55321")).toBe("local");
  });

  it("says unknown when the variable is absent or blank", () => {
    expect(supabaseProjectRef(undefined)).toBe("unknown");
    expect(supabaseProjectRef("")).toBe("unknown");
    expect(supabaseProjectRef("   ")).toBe("unknown");
  });

  it("says unknown for a malformed URL instead of echoing it back", () => {
    for (const malformed of [
      "vauokqoyvewtzubqajgh.supabase.co",
      "not a url",
      "https://",
      "sb_secret_pretend_this_was_pasted_into_the_url",
    ]) {
      expect(supabaseProjectRef(malformed)).toBe("unknown");
    }
  });

  it("says unknown for a host that is not a Supabase project, echoing nothing", () => {
    expect(supabaseProjectRef("https://db.example.com")).toBe("unknown");
    expect(supabaseProjectRef("https://supabase.co")).toBe("unknown");
    expect(supabaseProjectRef("https://evil.test/vauokqoyvewtzubqajgh.supabase.co")).toBe(
      "unknown",
    );
  });

  it("says unknown when the first label is not shaped like a ref", () => {
    expect(supabaseProjectRef("https://short.supabase.co")).toBe("unknown");
    expect(supabaseProjectRef("https://project-one.supabase.co")).toBe("unknown");
    expect(supabaseProjectRef("https://api.vauokqoyvewtzubqajgh.supabase.co")).toBe("unknown");
  });

  it("never returns anything but a ref, local or unknown", () => {
    const queryString = "https://vauokqoyvewtzubqajgh.supabase.co/?apikey=sb_secret_leaked";
    expect(supabaseProjectRef(queryString)).toBe("vauokqoyvewtzubqajgh");
    expect(
      supabaseProjectRef("https://user:sb_secret_leaked@vauokqoyvewtzubqajgh.supabase.co"),
    ).toBe("vauokqoyvewtzubqajgh");
  });
});
