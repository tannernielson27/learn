// #206: `src/lib/email` reads RESEND_API_KEY, which can send mail as info.tannernielson.com. It
// must never reach a browser bundle. The repo has no `server-only` package; like #149's signing
// key (`noClientSigningKey.test.ts`), this is held by walking the real import graph from every
// Client Component in the app.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../../components/testing/importGraph";

const EMAIL_DIR = path.join(SRC, "lib", "email") + path.sep;

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.tsx?$/.test(name)) return [];
    return [full];
  });
}

/** A Client Component: its first statement is the `"use client"` directive. */
function isClientModule(file: string): boolean {
  return /^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
    readFileSync(file, "utf8"),
  );
}

const CLIENT_MODULES = sourcesUnder(SRC).filter(isClientModule);

/** Every email module in `entry`'s bundle, each with the shortest chain that pulls it in. */
function leaks(entry: string): string[] {
  return [...reachable(entry).entries()]
    .filter(([file]) => file.startsWith(EMAIL_DIR))
    .map(([, chain]) => shortest(chain));
}

describe("the mailer stays on the server", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "learn-email-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("finds the Client Components to check", () => {
    const names = CLIENT_MODULES.map((file) => path.relative(SRC, file).replaceAll(path.sep, "/"));
    expect(names).toContain("components/live/StudentRoom.tsx");
    expect(names.length).toBeGreaterThan(10);
  });

  it.each(CLIENT_MODULES.map((file) => [path.relative(SRC, file), file] as const))(
    "%s does not reach src/lib/email",
    (_name, entry) => {
      expect(leaks(entry)).toEqual([]);
    },
  );

  it("would catch it: a Client Component that imports the mailer is flagged", () => {
    const planted = path.join(scratch, "Planted.tsx");
    writeFileSync(
      planted,
      '"use client";\nimport { getMailer } from "@/lib/email";\nexport const m = getMailer;\n',
    );
    expect(isClientModule(planted)).toBe(true);
    const found = leaks(planted);
    expect(found.some((line) => line.endsWith(path.join("email", "resend.ts")))).toBe(true);
  });
});
