import { describe, expect, it } from "vitest";
import { checkTarget, projectRefOf, redact } from "./safety.mjs";

// #187: the load script writes sixty participants and several hundred answers into whatever
// database it is pointed at. It must never be pointed at production's.

const LOCAL = {
  base: "http://127.0.0.1:3107",
  supabaseUrl: "http://127.0.0.1:55321",
  targetProject: "local",
  productionProject: null,
};

const PREVIEW = {
  base: "https://learn-git-feat-x-tanner-nielsons-projects.vercel.app",
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  targetProject: "abcdefghijklmnopqrst",
  productionProject: "zyxwvutsrqponmlkjihg",
};

describe("projectRefOf", () => {
  it("names the local stack, a hosted project, and nothing else", () => {
    expect(projectRefOf("http://127.0.0.1:55321")).toBe("local");
    expect(projectRefOf("http://localhost:55321")).toBe("local");
    expect(projectRefOf("https://vauokqoyvewtzubqajgh.supabase.co")).toBe("vauokqoyvewtzubqajgh");
    expect(projectRefOf("https://example.com")).toBe("unknown");
    expect(projectRefOf("not a url")).toBe("unknown");
    expect(projectRefOf(undefined)).toBe("unknown");
  });
});

describe("checkTarget", () => {
  it("lets a run against the local stack through without asking production anything", () => {
    expect(checkTarget(LOCAL)).toEqual({ ok: true, project: "local" });
  });

  it("lets a preview on its own project through", () => {
    expect(checkTarget(PREVIEW)).toEqual({ ok: true, project: "abcdefghijklmnopqrst" });
  });

  it("refuses the production deployment by its address, whatever it reports", () => {
    for (const base of [
      "https://learn-tanner-nielsons-projects.vercel.app",
      "https://LEARN-tanner-nielsons-projects.vercel.app/join",
    ]) {
      const verdict = checkTarget({ ...PREVIEW, base });
      expect(verdict.ok).toBe(false);
      expect(verdict.ok ? "" : verdict.reason).toMatch(/production deployment/);
    }
  });

  it("refuses any deployment whose database is production's", () => {
    const verdict = checkTarget({ ...PREVIEW, productionProject: PREVIEW.targetProject });
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.ok ? "" : verdict.reason).toMatch(/production's Supabase project/);
  });

  it("refuses a hosted target when production's project could not be confirmed", () => {
    const verdict = checkTarget({ ...PREVIEW, productionProject: null });
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.ok ? "" : verdict.reason).toMatch(/could not confirm/i);
  });

  it("refuses a project named in the extra deny list", () => {
    const verdict = checkTarget({ ...PREVIEW, extraProductionRefs: ["abcdefghijklmnopqrst"] });
    expect(verdict).toMatchObject({ ok: false });
  });

  it("refuses when the app and the sockets would be on different projects", () => {
    const verdict = checkTarget({ ...PREVIEW, targetProject: "local" });
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.ok ? "" : verdict.reason).toMatch(/reports Supabase project/);
  });

  it("refuses a Supabase URL it cannot name, and a base that is not http", () => {
    expect(checkTarget({ ...LOCAL, supabaseUrl: "https://example.com" }).ok).toBe(false);
    expect(checkTarget({ ...LOCAL, base: "ftp://127.0.0.1" }).ok).toBe(false);
    expect(checkTarget({ ...LOCAL, base: "nonsense" }).ok).toBe(false);
  });
});

describe("redact", () => {
  it("takes every secret out of a message, however often it appears", () => {
    const text = "key sb_publishable_abc and again sb_publishable_abc, token eyJ.x.y";
    expect(redact(text, ["sb_publishable_abc", "eyJ.x.y", "", undefined])).toBe(
      "key [redacted] and again [redacted], token [redacted]",
    );
  });
});
