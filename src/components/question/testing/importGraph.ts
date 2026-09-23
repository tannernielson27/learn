// A source-level import walk for bundle-boundary tests: the scoring engine must not reach a
// student's player (ADR 0003 / #56), and the gallery nav must not reach the renderers (#54).
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const SRC = path.resolve(import.meta.dirname, "..", "..", "..");

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

export interface ImportGraph {
  /** Every local module reached, mapped to the chain of imports that reached it. */
  files: Map<string, string[]>;
  /** Every package specifier imported along the way, e.g. "@dnd-kit/core". */
  packages: Set<string>;
}

/** Every module reachable from `entry` through imports that survive into the bundle. */
export function importGraph(entry: string): ImportGraph {
  const files = new Map<string, string[]>([[entry, [entry]]]);
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const chain = files.get(file) as string[];
    const source = readFileSync(file, "utf8");
    const statements = [
      ...source.matchAll(IMPORTS),
      ...source.matchAll(REEXPORTS),
      ...source.matchAll(DYNAMIC_IMPORTS),
    ];
    for (const [, typeOnly, specifier] of statements) {
      if (typeOnly) continue;
      const target = resolveLocal(specifier, file);
      if (!target) {
        if (!specifier.startsWith(".") && !specifier.startsWith("@/")) packages.add(specifier);
        continue;
      }
      if (files.has(target)) continue;
      files.set(target, [...chain, target]);
      queue.push(target);
    }
  }
  return { files, packages };
}

export const describeChain = (chain: string[]) =>
  chain.map((f) => path.relative(SRC, f)).join(" -> ");
