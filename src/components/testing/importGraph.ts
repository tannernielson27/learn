/**
 * Walks the real import graph from a source file, the way a bundler would follow it, for tests
 * that hold an invariant about what may reach a browser bundle: `noClientScoring.test.ts` (the
 * scoring engine, ADR 0003) and `noClientSigningKey.test.ts` (the channel signing key, #149), and the gallery nav's
 * `nav.test.ts` (#54).
 *
 * Test-only. It lives under a `testing` folder, which the coverage config excludes.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const SRC = path.resolve(import.meta.dirname, "..", "..");

// `import ... from "x"` and `export ... from "x"`, capturing whether the statement is type-only.
// A type-only statement is erased before bundling, so it carries nothing into the bundle.
const IMPORTS = /import\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const REEXPORTS = /export\s+(type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+["']([^"']+)["']/g;
// `import("x")`. Since #54 each renderer is its own lazy chunk, and a lazy chunk is still code the
// browser runs, so the walk follows these too. The empty group keeps the tuple shape.
const DYNAMIC_IMPORTS = /import\(()\s*["']([^"']+)["']\s*\)/g;

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

/** Every specifier a file imports in a way that survives into the bundle. */
function bundledSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const statements = [
    ...source.matchAll(IMPORTS),
    ...source.matchAll(REEXPORTS),
    ...source.matchAll(DYNAMIC_IMPORTS),
  ];
  return statements.filter(([, typeOnly]) => !typeOnly).map(([, , specifier]) => specifier);
}

/**
 * Every module reachable from `entry` through imports that survive into the bundle, as a map from
 * file to the chain of imports that reached it.
 */
export function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const chain = seen.get(file) as string[];
    for (const specifier of bundledSpecifiers(file)) {
      const target = resolveLocal(specifier, file);
      if (!target || seen.has(target)) continue;
      seen.set(target, [...chain, target]);
      queue.push(target);
    }
  }
  return seen;
}

/** Every package (non-local) specifier the modules of a graph import, with the chain to it. */
export function packagesIn(graph: Map<string, string[]>): { specifier: string; chain: string[] }[] {
  const found: { specifier: string; chain: string[] }[] = [];
  for (const [file, chain] of graph) {
    for (const specifier of bundledSpecifiers(file)) {
      if (resolveLocal(specifier, file) === undefined && !specifier.startsWith(".")) {
        found.push({ specifier, chain });
      }
    }
  }
  return found;
}

export const shortest = (chain: string[]) => chain.map((f) => path.relative(SRC, f)).join(" -> ");
