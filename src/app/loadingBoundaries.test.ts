import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `loading.tsx` wraps its segment's page and every route below it in Suspense, and once its
 * fallback streams the status line is sent: a `notFound()` under it then answers 200, not 404
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md, "Status
 * Codes"; docs/ui-polish-log.md row 6). So no loading state may sit above a page that can call
 * `notFound()`. The student home's lives in the `(home)` route group for this reason.
 */

const APP = path.resolve(import.meta.dirname);

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

// Either separator, so the check means the same on Windows as on CI's Linux.
const ROUTE_FILE = /[\\/](page|layout|not-found|template)\.tsx?$/;
const LOADING_FILE = /[\\/]loading\.tsx?$/;
const CALLS_NOT_FOUND = /\bnotFound\(\)/;

/** The source without its comments, so a page that explains `notFound()` is not taken to call it. */
const code = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every route file under a loading boundary that can call `notFound()`, relative to src/app. */
function notFoundsUnderLoading(appDir: string): string[] {
  const all = filesUnder(appDir);
  return all
    .filter((file) => LOADING_FILE.test(file))
    .flatMap((loading) => {
      const segment = path.dirname(loading);
      return all.filter(
        (file) =>
          file.startsWith(`${segment}${path.sep}`) &&
          ROUTE_FILE.test(file) &&
          CALLS_NOT_FOUND.test(code(file)),
      );
    })
    .map((file) => path.relative(appDir, file));
}

describe("loading boundaries", () => {
  it("never sit above a page that can answer 404", () => {
    expect(notFoundsUnderLoading(APP)).toEqual([]);
  });

  it("finds one that does, so a clean result means something", () => {
    const root = mkdtempSync(path.join(tmpdir(), "loading-"));
    try {
      const write = (file: string, text: string) => {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), text);
      };
      write("learn/loading.tsx", "export default function L() {}");
      write("learn/[id]/page.tsx", "if (!ok) notFound();");
      write("learn/(home)/loading.tsx", "export default function L() {}");
      write("learn/(home)/page.tsx", "export default function P() {}");
      write("other/page.tsx", "notFound();");
      write("learn/(list)/page.tsx", "/** A child's `notFound()` must still answer 404. */");
      expect(notFoundsUnderLoading(root)).toEqual([path.join("learn", "[id]", "page.tsx")]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
