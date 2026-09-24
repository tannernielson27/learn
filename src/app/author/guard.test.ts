import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #204: every authoring surface checks the author role on the server. RLS already refuses an
 * account with no role; this keeps the UI agreeing with it, so nobody sees an empty editor instead
 * of "No access yet". A page, route handler or Server Function added later without the check fails
 * here rather than in review.
 *
 * Checked by reading the source, deliberately: the guard has to be in the file, called before any
 * work, and a mock-based test of each page would only prove the mock was called.
 */

const ROOTS = ["src/app/author", "src/app/live"].map((dir) => path.resolve(dir));

/** Pages that are the answer to a failed check, or not authoring at all. */
const EXEMPT_PAGES = new Set(["author/no-access/page.tsx"]);

/** Server Functions that are not authoring. */
const EXEMPT_ACTIONS = new Set(["signOut"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function relative(file: string): string {
  return path.relative(path.resolve("src/app"), file).split(path.sep).join("/");
}

const files = ROOTS.flatMap(walk).filter((file) => !/\.test\.tsx?$/.test(file));

/** Names of the exported async functions in a "use server" file. */
function exportedActions(source: string): string[] {
  return [...source.matchAll(/export async function (\w+)/g)].map((match) => match[1]!);
}

/** The body of one top-level function, up to the next top-level declaration. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(export |async function |function |const |type |interface )/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Local helpers that themselves call requireAuthor, so an action may go through one. */
function guardedHelpers(source: string): string[] {
  // `[<(]`: a helper may be generic, as `saveDraft<Values>(` is.
  return [...source.matchAll(/\n(?:async )?function (\w+)[<(]/g)]
    .map((match) => match[1]!)
    .filter((name) => {
      const start = source.search(new RegExp(`function ${name}[<(]`));
      const rest = source.slice(start);
      const next = rest.slice(1).search(/\n(export |async function |function )/);
      return (next === -1 ? rest : rest.slice(0, next + 1)).includes("requireAuthor(");
    });
}

describe("authoring guards", () => {
  const pages = files.filter((file) => file.endsWith("page.tsx"));
  it.each(pages.map((file) => [relative(file), file]))("%s checks the author", (name, file) => {
    if (EXEMPT_PAGES.has(name)) return;
    expect(readFileSync(file, "utf8")).toMatch(/await requireAuthor\(/);
  });

  const routes = files.filter((file) => file.endsWith("route.ts"));
  it.each(routes.map((file) => [relative(file), file]))(
    "%s answers through a guarded handler",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      // Each handler delegates to a src/lib function that starts with authorForRoute; those have
      // their own tests for the forbidden answer.
      expect(source).toMatch(
        /from "@\/lib\/(authoring\/exportRoute|authoring\/scoreRoute|liveSupabase\/reportCsvRoute|assignments\/reportCsvRoute)"/,
      );
    },
  );

  const actionFiles = files.filter((file) => readFileSync(file, "utf8").startsWith('"use server"'));
  it("finds the Server Function files", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(5);
  });
  for (const file of actionFiles) {
    const source = readFileSync(file, "utf8");
    const helpers = guardedHelpers(source);
    const actions = exportedActions(source).filter((name) => !EXEMPT_ACTIONS.has(name));
    it.each(actions)(`${relative(file)}: %s checks the author`, (name) => {
      const body = bodyOf(source, name);
      const guarded =
        body.includes("requireAuthor(") || helpers.some((helper) => body.includes(`${helper}(`));
      expect(guarded).toBe(true);
    });
  }
});

describe("the guarded route handlers", () => {
  it.each([
    "src/lib/authoring/exportRoute.ts",
    "src/lib/authoring/scoreRoute.ts",
    "src/lib/liveSupabase/reportCsvRoute.ts",
    "src/lib/assignments/reportCsvRoute.ts",
  ])("%s checks the author", (file) => {
    expect(readFileSync(path.resolve(file), "utf8")).toMatch(/await authorForRoute\(\)/);
  });
});
