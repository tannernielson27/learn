// ADR 0003 / #56: the shared players render for students, so the scoring engine must not reach
// their bundle — directly or through anything they import. Scores are passed in as props. The
// gallery and the authoring preview import the engine themselves, which keeps it in their own
// route bundles.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "..", "..");
const ENGINE_DIR = path.join(SRC, "lib", "ngn", "scoring");

/**
 * The players a student can be put in front of, and — since #133 — the live-session screen that
 * mounts one. That screen is the first place outside the gallery where a real student answers a
 * real item, so it is held to the same rule: the scoring engine is the server's, and a phone that
 * cannot score cannot be made to leak how an item is scored.
 */
const ENTRY_POINTS = [
  path.join(SRC, "components", "question", "ItemPlayer.tsx"),
  path.join(SRC, "components", "case-study", "CaseStudyPlayer.tsx"),
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
];

// `import ... from "x"` and `export ... from "x"`, capturing whether the statement is type-only.
// A type-only statement is erased before bundling, so it carries nothing into the bundle.
const IMPORTS = /import\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const REEXPORTS = /export\s+(type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+["']([^"']+)["']/g;

/** Resolves a local specifier to a file on disk; returns undefined for packages. */
function resolveLocal(specifier: string, fromFile: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : undefined;
  if (!base) return undefined;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

/**
 * Every module reachable from `entry` through imports that survive into the bundle, as a map from
 * file to the chain of imports that reached it.
 */
function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const chain = seen.get(file) as string[];
    const source = readFileSync(file, "utf8");
    const statements = [...source.matchAll(IMPORTS), ...source.matchAll(REEXPORTS)];
    for (const [, typeOnly, specifier] of statements) {
      if (typeOnly) continue;
      const target = resolveLocal(specifier, file);
      if (!target || seen.has(target)) continue;
      seen.set(target, [...chain, target]);
      queue.push(target);
    }
  }
  return seen;
}

const shortest = (chain: string[]) => chain.map((f) => path.relative(SRC, f)).join(" -> ");

describe("the shared players hold no scoring code", () => {
  it.each(ENTRY_POINTS.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches the scoring engine",
    (_name, entry) => {
      const graph = reachable(entry);
      // A sanity check that the walk actually walked: the player pulls in its renderers.
      expect(graph.size).toBeGreaterThan(20);
      const offenders = [...graph.entries()]
        .filter(([file]) => file.startsWith(ENGINE_DIR + path.sep))
        .map(([, chain]) => shortest(chain));
      expect(offenders).toEqual([]);
    },
  );

  it("would catch the engine coming back", () => {
    // The gallery is allowed to score in the browser, so it is the proof that the walk finds it.
    const gallery = path.join(SRC, "app", "gallery", "items", "[type]", "playground.tsx");
    const reached = [...reachable(gallery).keys()];
    expect(reached.some((f) => f.startsWith(ENGINE_DIR + path.sep))).toBe(true);
  });
});
