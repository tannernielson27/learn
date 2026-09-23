// #149: `src/lib/supabase/channelToken.ts` reads SUPABASE_JWT_SIGNING_KEY, which can sign a token
// for any Postgres role, `service_role` included. It must never reach a browser bundle. That used
// to be held by a comment ("import module by module, not through the barrel"); this test holds it
// by walking the real import graph from every Client Component in the app, the way
// `noClientScoring.test.ts` holds the scoring engine out of the student's players.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "../testing/importGraph";

const SIGNING_MODULE = path.join(SRC, "lib", "supabase", "channelToken.ts");

/** Node's crypto, in either spelling. Nothing a browser loads has any business importing it. */
const NODE_CRYPTO = new Set(["node:crypto", "crypto"]);

/** Every source file under `dir`, tests excluded. */
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

/** What in `entry`'s bundle would carry the signing key, or Node's crypto, to a browser. */
function leaks(entry: string): string[] {
  const graph = reachable(entry);
  const signing = [...graph.entries()]
    .filter(([file]) => file === SIGNING_MODULE)
    .map(([, chain]) => shortest(chain));
  const crypto = packagesIn(graph)
    .filter(({ specifier }) => NODE_CRYPTO.has(specifier))
    .map(({ specifier, chain }) => `${shortest(chain)} imports ${specifier}`);
  return [...signing, ...crypto];
}

describe("the channel signing key stays on the server", () => {
  it("finds the Client Components to check, including both live-session screens", () => {
    const names = CLIENT_MODULES.map((file) => path.relative(SRC, file).replaceAll(path.sep, "/"));
    expect(names).toContain("components/live/StudentRoom.tsx");
    expect(names).toContain("components/live/HostLobby.tsx");
  });

  it.each(CLIENT_MODULES.map((file) => [path.relative(SRC, file), file] as const))(
    "%s reaches neither channelToken.ts nor node:crypto",
    (_name, entry) => {
      expect(leaks(entry)).toEqual([]);
    },
  );

  it("would catch it: the play page, a Server Component, does reach the signing module", () => {
    const page = path.join(SRC, "app", "play", "[sessionId]", "page.tsx");
    expect(
      leaks(page).some((line) => line.endsWith(path.join("supabase", "channelToken.ts"))),
    ).toBe(true);
    expect(leaks(page).some((line) => line.includes("imports node:crypto"))).toBe(true);
  });
});
