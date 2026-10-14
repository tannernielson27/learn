import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `src/lib/ngn` is pure TypeScript (ADR 0001) and ESLint already refuses React, Next and Supabase
 * there. The drafts sit next to the AI import, so this also holds them clear of the Anthropic SDK:
 * the calls to Claude belong in src/lib/aiImport, never in the converters (#337).
 */
const FORBIDDEN = /^(react|react-dom|next|@supabase\/|@anthropic-ai\/|@\/components\/|@\/app\/)/;

const sources = readdirSync(import.meta.dirname).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);

describe("src/lib/ngn/draft purity", () => {
  it("has sources to check", () => {
    expect(sources).toContain("index.ts");
  });

  it.each(sources)("%s imports no framework, database or AI SDK", (name) => {
    const imports = importsOf(readFileSync(join(import.meta.dirname, name), "utf8"));
    expect(imports.filter((specifier) => FORBIDDEN.test(specifier))).toEqual([]);
  });

  it("would catch a forbidden import", () => {
    expect(importsOf('import Anthropic from "@anthropic-ai/sdk";')).toEqual(["@anthropic-ai/sdk"]);
    expect(FORBIDDEN.test("@anthropic-ai/sdk")).toBe(true);
  });
});
