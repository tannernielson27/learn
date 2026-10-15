// #342: `src/lib/aiImport` reads ANTHROPIC_API_KEY, which spends the owner's money. It must never
// reach a browser bundle. As for the mailer (`noClientEmail.test.ts`), this walks the real import
// graph from every Client Component in the app.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../../components/testing/importGraph";

const AI_IMPORT_DIR = path.join(SRC, "lib", "aiImport") + path.sep;

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

const CLIENT_MODULES = sourcesUnder(SRC).filter(isClientModule);

function leaks(entry: string): string[] {
  return [...reachable(entry).entries()]
    .filter(([file]) => file.startsWith(AI_IMPORT_DIR))
    .map(([, chain]) => shortest(chain));
}

describe("AI import stays on the server", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "learn-ai-import-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it.each(CLIENT_MODULES.map((file) => [path.relative(SRC, file), file] as const))(
    "%s does not reach src/lib/aiImport",
    (_name, entry) => {
      expect(leaks(entry)).toEqual([]);
    },
  );

  it("would catch it: a Client Component that imports the Claude client is flagged", () => {
    const planted = path.join(scratch, "Planted.tsx");
    writeFileSync(
      planted,
      '"use client";\nimport { createClaudeClient } from "@/lib/aiImport/claude";\nexport const c = createClaudeClient;\n',
    );
    const found = leaks(planted);
    expect(found.some((line) => line.endsWith(path.join("aiImport", "claude.ts")))).toBe(true);
  });

  it("reads the key in one place, and never as a public variable", () => {
    const readers = sourcesUnder(AI_IMPORT_DIR).filter((file) =>
      readFileSync(file, "utf8").includes("ANTHROPIC_API_KEY"),
    );
    expect(readers.map((file) => path.basename(file)).sort()).toEqual(["claude.ts", "config.ts"]);
    for (const file of sourcesUnder(AI_IMPORT_DIR)) {
      expect(readFileSync(file, "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*ANTHROPIC/);
    }
  });
});
