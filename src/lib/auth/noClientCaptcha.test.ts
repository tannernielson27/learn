// #359: `captcha.ts` reads TURNSTILE_SECRET_KEY, which can pass any CAPTCHA token for the site.
// It must never reach a browser bundle. Like the mailer (`../email/noClientEmail.test.ts`), this
// is held by walking the real import graph from every Client Component in the app.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../../components/testing/importGraph";

const CAPTCHA = path.join(SRC, "lib", "auth", "captcha.ts");

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

const SOURCES = sourcesUnder(SRC);
const CLIENT_MODULES = SOURCES.filter(isClientModule);

/** The chain that pulls `captcha.ts` into `entry`'s bundle, if any does. */
function leaks(entry: string): string[] {
  return [...reachable(entry).entries()]
    .filter(([file]) => file === CAPTCHA)
    .map(([, chain]) => shortest(chain));
}

describe("the CAPTCHA secret stays on the server (#359)", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "learn-captcha-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("finds the Client Components to check, the widget among them", () => {
    const names = CLIENT_MODULES.map((file) => path.relative(SRC, file).replaceAll(path.sep, "/"));
    expect(names).toContain("components/auth/CaptchaField.tsx");
    expect(names.length).toBeGreaterThan(10);
  });

  it.each(CLIENT_MODULES.map((file) => [path.relative(SRC, file), file] as const))(
    "%s does not reach src/lib/auth/captcha.ts",
    (_name, entry) => {
      expect(leaks(entry)).toEqual([]);
    },
  );

  it("would catch it: a Client Component that imports the verifier is flagged", () => {
    const planted = path.join(scratch, "Planted.tsx");
    writeFileSync(
      planted,
      '"use client";\nimport { verifyCaptcha } from "@/lib/auth/captcha";\nexport const v = verifyCaptcha;\n',
    );
    expect(isClientModule(planted)).toBe(true);
    expect(leaks(planted)).toHaveLength(1);
  });

  it("names the secret in one source file only, and never under a public name", () => {
    const naming = SOURCES.filter((file) =>
      readFileSync(file, "utf8").includes("TURNSTILE_SECRET_KEY"),
    );
    expect(naming).toEqual([CAPTCHA]);
    // Next inlines only `process.env.NEXT_PUBLIC_*` reads into a browser bundle.
    expect(readFileSync(CAPTCHA, "utf8")).not.toMatch(/process\.env\.NEXT_PUBLIC_TURNSTILE_SECRET/);
  });
});
