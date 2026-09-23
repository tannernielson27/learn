import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR 0002's Consequences: "The interface must not leak Supabase types. Review this in the Phase 3
 * PR that introduces it." This is that review, written down so it holds for every later change
 * rather than for one reading of one pull request.
 *
 * `src/lib/ngn/**` is kept pure by an ESLint override in `eslint.config.mjs`. The same override
 * should name `src/lib/live/**` — a `config-protection` hook on this machine refuses edits to that
 * file, so the rule lives here instead, where CI runs it just as reliably. If the override is added
 * later this file is still worth keeping: it is the one check that reads `@supabase` and
 * `@/lib/supabase` as the same mistake.
 */
const LIVE_DIR = path.join(process.cwd(), "src", "lib", "live");

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /^@supabase(\/|$)/, why: "the Supabase client" },
  { pattern: /^@\/lib\/supabase(\/|$)/, why: "this repo's Supabase wrappers and generated types" },
  { pattern: /^react(-dom)?(\/|$)/, why: "React" },
  { pattern: /^next(\/|$)/, why: "Next.js" },
  { pattern: /^@\/components(\/|$)/, why: "UI code" },
  { pattern: /^@\/app(\/|$)/, why: "route code" },
];

/**
 * Every module specifier a file imports from: `import … from "x"`, bare `import "x"`, `export …
 * from "x"`, and `import("x")` / `require("x")`. The dynamic forms matter most — this test is the
 * only thing enforcing the rule until the ESLint override lands, and `await import("…")` is exactly
 * how a static check gets walked around by accident.
 */
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
  let match = pattern.exec(source);
  while (match !== null) {
    specifiers.push(match[1] as string);
    match = pattern.exec(source);
  }
  return specifiers;
}

// Recursive, so a subfolder such as `results/` (#179) is held to the same rule. Names use forward
// slashes on every platform so the test titles read the same on Windows and in CI.
const sources = readdirSync(LIVE_DIR, { recursive: true, encoding: "utf8" })
  .map((name) => name.split(path.sep).join("/"))
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({ name, source: readFileSync(path.join(LIVE_DIR, name), "utf8") }));

describe("src/lib/live is pure TypeScript", () => {
  it("has files to check, in subfolders too", () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.map(({ name }) => name)).toContain("results/index.ts");
  });

  it("reads dynamic imports and re-exports, not only static ones", () => {
    const sample = [
      'import one from "static";',
      'import "bare";',
      'export { two } from "re-exported";',
      'const three = await import("dynamic");',
      'const four = require("required");',
    ].join("\n");
    expect(importsOf(sample)).toEqual(["static", "bare", "re-exported", "dynamic", "required"]);
  });

  it.each(sources.map(({ name }) => name))("%s imports nothing forbidden", (name) => {
    const { source } = sources.find((file) => file.name === name) as (typeof sources)[number];
    for (const specifier of importsOf(source)) {
      for (const { pattern, why } of FORBIDDEN) {
        expect(
          pattern.test(specifier),
          `${name} imports ${specifier}: ${why} may not reach src/lib/live (ADR 0001, ADR 0002)`,
        ).toBe(false);
      }
    }
  });

  it("names Supabase nowhere but in prose about not depending on it", () => {
    for (const { name, source } of sources) {
      // Comments may (and do) explain the rule; code may not mention the vendor at all.
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(withoutComments.toLowerCase(), name).not.toContain("supabase");
    }
  });
});
