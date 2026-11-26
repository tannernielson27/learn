// #621: `src/lib/ai` reads ANTHROPIC_API_KEY, which spends the owner's money, for every AI feature
// (import now, drafting next, ADR 0018). It must never reach a browser bundle. As for AI import
// (`noClientAiImport.test.ts`) and the mailer, this walks the real import graph from every Client
// Component in the app.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../../components/testing/importGraph";

const AI_DIR = path.join(SRC, "lib", "ai") + path.sep;

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.tsx?$/.test(name)) return [];
    return [full];
  });
}

function isClientModule(file: string): boolean {
  return /^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
    readFileSync(file, "utf8"),
  );
}

const APP_SOURCES = sourcesUnder(SRC);
const CLIENT_MODULES = APP_SOURCES.filter(isClientModule);

function leaks(entry: string): string[] {
  return [...reachable(entry).entries()]
    .filter(([file]) => file.startsWith(AI_DIR))
    .map(([, chain]) => shortest(chain));
}

describe("the Claude call path stays on the server", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "learn-ai-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("finds the Client Components to check", () => {
    expect(CLIENT_MODULES.length).toBeGreaterThan(10);
  });

  it.each(CLIENT_MODULES.map((file) => [path.relative(SRC, file), file] as const))(
    "%s does not reach src/lib/ai",
    (_name, entry) => {
      expect(leaks(entry)).toEqual([]);
    },
  );

  it.each([
    ["the Claude client", "claude", "createClaudeClient"],
    ["the ledger", "ledger", "reserveUsage"],
    ["the settings", "config", "aiDraftEnabled"],
  ])("would catch it: a Client Component that imports %s is flagged", (_what, file, name) => {
    const planted = path.join(scratch, `Planted-${file}.tsx`);
    writeFileSync(
      planted,
      `"use client";\nimport { ${name} } from "@/lib/ai/${file}";\nexport const c = ${name};\n`,
    );
    const found = leaks(planted);
    expect(found.some((line) => line.endsWith(path.join("ai", `${file}.ts`)))).toBe(true);
  });

  it("reads the key in one place, and never as a public variable", () => {
    const readers = sourcesUnder(AI_DIR).filter((file) =>
      readFileSync(file, "utf8").includes("ANTHROPIC_API_KEY"),
    );
    expect(readers.map((file) => path.basename(file)).sort()).toEqual(["claude.ts", "config.ts"]);
    // Nowhere in the app, not only here, may the key have a name the browser bundle would get.
    for (const file of APP_SOURCES) {
      expect(readFileSync(file, "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*ANTHROPIC/);
    }
  });

  it("no app code outside src/lib/ai reads the key", () => {
    const outside = APP_SOURCES.filter(
      (file) =>
        !file.startsWith(AI_DIR) && readFileSync(file, "utf8").includes("ANTHROPIC_API_KEY"),
    );
    expect(outside.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("depends on no feature: nothing in src/lib/ai imports from src/lib/aiImport", () => {
    for (const file of sourcesUnder(AI_DIR)) {
      expect(readFileSync(file, "utf8")).not.toMatch(
        /from\s+["'](@\/lib\/aiImport|\.\.\/aiImport)/,
      );
    }
  });
});
