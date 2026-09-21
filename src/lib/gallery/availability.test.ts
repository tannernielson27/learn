import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { galleryIsAvailable } from "./availability";

describe("galleryIsAvailable", () => {
  it("says no on the production deployment", () => {
    expect(galleryIsAvailable("production")).toBe(false);
  });

  it.each(["preview", "development"])("says yes on a %s deployment", (vercelEnv) => {
    expect(galleryIsAvailable(vercelEnv)).toBe(true);
  });

  it("says yes where the variable is absent, which is every machine off Vercel", () => {
    expect(galleryIsAvailable(undefined)).toBe(true);
  });

  it("reads nothing but an exact match, so a value like production-ish stays open", () => {
    // The point is that the check is not a prefix or substring test: only Vercel's own literal
    // closes the gallery, and no near miss silently does the same on a preview.
    expect(galleryIsAvailable("production-ish")).toBe(true);
    expect(galleryIsAvailable("PRODUCTION")).toBe(true);
  });

  describe("reading the environment", () => {
    const saved = process.env.VERCEL_ENV;

    afterEach(() => {
      if (saved === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = saved;
    });

    it("defaults to VERCEL_ENV rather than to an argument the caller has to remember", () => {
      process.env.VERCEL_ENV = "production";
      expect(galleryIsAvailable()).toBe(false);

      process.env.VERCEL_ENV = "preview";
      expect(galleryIsAvailable()).toBe(true);
    });

    it("stays open when the variable is unset, whatever NODE_ENV says", () => {
      delete process.env.VERCEL_ENV;
      expect(galleryIsAvailable()).toBe(true);
    });
  });
});

describe("the module reads the right variable", () => {
  // NODE_ENV is "production" for every optimized Next build, preview deployments included, so
  // swapping it in here would close the gallery exactly where ADR 0003 wants it open. Node's
  // types make NODE_ENV read-only, so this is asserted on the source rather than by setting it.
  const source = readFileSync(new URL("./availability.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("names VERCEL_ENV", () => {
    expect(code).toContain("process.env.VERCEL_ENV");
  });

  it("names NODE_ENV nowhere but in prose about not using it", () => {
    expect(code).not.toContain("NODE_ENV");
    expect(source).toContain("NODE_ENV");
  });
});
