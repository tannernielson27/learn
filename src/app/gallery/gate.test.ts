// ADR 0003 / #146: the gallery ships answer keys to the browser by design, so the whole segment
// is closed on the production deployment. `src/lib/gallery/availability.test.ts` checks that the
// predicate reads the right variable. This file checks the part a unit test cannot: that every
// route under `/gallery` actually goes through the one place that calls it, so a route added next
// sprint is gated the moment it lands rather than the day someone remembers.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(APP, "..");
const GALLERY_LAYOUT = path.join(APP, "gallery", "layout.tsx");

/** The files Next turns into a URL. `route.*` is listed because it is the one that skips layouts. */
const ROUTE_FILES = new Set(["page.tsx", "page.ts", "route.ts", "route.tsx", "default.tsx"]);
const HANDLER_FILES = new Set(["route.ts", "route.tsx"]);

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

/** Every route file under `src/app`, in walk order. */
function routeFiles(dir: string = APP): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routeFiles(full));
    else if (ROUTE_FILES.has(entry.name)) found.push(full);
  }
  return found;
}

/**
 * The URL a route file answers on, with the folder conventions that do not appear in a URL taken
 * out: route groups `(name)`, private folders `_name` and parallel slots `@name`. Route groups are
 * the reason this is not a string comparison on the file path — `app/(demo)/gallery/x/page.tsx`
 * serves `/gallery/x` from outside the gallery folder, and so would be invisible to a grep.
 */
function urlPathOf(file: string): string {
  const segments = path
    .relative(APP, path.dirname(file))
    .split(path.sep)
    .filter((s) => s !== "" && s !== "." && !s.startsWith("(") && !s.startsWith("_"))
    .map((s) => (s.startsWith("@") ? "" : s))
    .filter((s) => s !== "");
  return `/${segments.join("/")}`;
}

const isGalleryUrl = (url: string) => url === "/gallery" || url.startsWith("/gallery/");

/**
 * The layouts that wrap this route, innermost first. Only `page`/`default` files are wrapped —
 * a route handler is called directly, which is why handlers are checked separately below.
 */
function layoutChain(file: string): string[] {
  const chain: string[] = [];
  let dir = path.dirname(file);
  for (;;) {
    const layout = path.join(dir, "layout.tsx");
    if (existsSync(layout)) chain.push(layout);
    if (dir === APP) return chain;
    dir = path.dirname(dir);
  }
}

/** Source with comments removed, so prose about the gate can never stand in for the gate. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Whether this file turns the production deployment away before rendering anything. */
function callsTheGate(source: string): boolean {
  const code = withoutComments(source);
  const importsPredicate =
    /import\s*\{[^}]*\bgalleryIsAvailable\b[^}]*\}\s*from\s*["']@\/lib\/gallery\/availability["']/.test(
      code,
    );
  const importsNotFound =
    /import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(code);
  const refuses = /if\s*\(\s*!\s*galleryIsAvailable\s*\(\s*\)\s*\)\s*\{?\s*notFound\s*\(\s*\)/.test(
    code,
  );
  return importsPredicate && importsNotFound && refuses;
}

const galleryRoutes = routeFiles().filter((file) => isGalleryUrl(urlPathOf(file)));
const galleryPages = galleryRoutes.filter((file) => !HANDLER_FILES.has(path.basename(file)));
const galleryHandlers = galleryRoutes.filter((file) => HANDLER_FILES.has(path.basename(file)));

describe("every gallery route is behind the production gate", () => {
  it("found the gallery routes to check", () => {
    // Nine at the time of #146. The number only ever grows, and the assertion is here so that a
    // walk that silently stopped finding anything cannot pass the rest of this file.
    expect(galleryRoutes.length).toBeGreaterThanOrEqual(9);
    const urls = galleryRoutes.map(urlPathOf);
    expect(urls).toContain("/gallery");
    expect(urls).toContain("/gallery/live");
    expect(urls).toContain("/gallery/items/[type]");
  });

  it.each(galleryPages.map((file) => [rel(file), file] as const))(
    "%s renders inside the gated layout",
    (name, file) => {
      expect(
        layoutChain(file),
        `${name} serves a /gallery URL without passing through src/app/gallery/layout.tsx, so the ` +
          `ADR 0003 gate does not apply to it. Move it under src/app/gallery/ or call the gate itself.`,
      ).toContain(GALLERY_LAYOUT);
    },
  );

  it("the gated layout is the thing that turns production away", () => {
    expect(callsTheGate(readFileSync(GALLERY_LAYOUT, "utf8"))).toBe(true);
  });

  it("no gallery route handler slips past, since layouts do not wrap them", () => {
    // Empty today. When the first one arrives it has to refuse production on its own, because
    // Next calls a route handler directly and src/app/gallery/layout.tsx never runs for it.
    const ungated = galleryHandlers
      .filter((file) => !callsTheGate(readFileSync(file, "utf8")))
      .map(rel);
    expect(ungated).toEqual([]);
  });
});

describe("the check would catch a route that skipped the gate", () => {
  it("reads a URL out of a file path the way Next does", () => {
    const at = (...segments: string[]) => urlPathOf(path.join(APP, ...segments));
    expect(at("gallery", "page.tsx")).toBe("/gallery");
    expect(at("gallery", "items", "[type]", "page.tsx")).toBe("/gallery/items/[type]");
    // The three folder conventions that do not appear in the URL. Each one is a way a gallery
    // route could sit outside src/app/gallery and still answer on /gallery.
    expect(at("(demo)", "gallery", "raw", "page.tsx")).toBe("/gallery/raw");
    expect(at("gallery", "_internal", "page.tsx")).toBe("/gallery");
    expect(at("gallery", "@slot", "page.tsx")).toBe("/gallery");
  });

  it("does not call every route gated", () => {
    // If containment in the layout chain were trivially true the assertion above would prove
    // nothing, so here is a real route that is correctly outside the gallery's layout.
    const home = path.join(APP, "page.tsx");
    expect(existsSync(home)).toBe(true);
    expect(layoutChain(home)).not.toContain(GALLERY_LAYOUT);
  });

  it("does not accept a file that only talks about the gate", () => {
    const prose = [
      "// The gallery is closed on production: galleryIsAvailable() decides, notFound() answers.",
      "export default function Page() { return null; }",
    ].join("\n");
    expect(callsTheGate(prose)).toBe(false);
  });

  it("does not accept an import without a call, or a call without the import", () => {
    const importOnly = [
      'import { notFound } from "next/navigation";',
      'import { galleryIsAvailable } from "@/lib/gallery/availability";',
      "export function GET() { return new Response(); }",
    ].join("\n");
    expect(callsTheGate(importOnly)).toBe(false);

    const callOnly = [
      "export function GET() {",
      "  if (!galleryIsAvailable()) notFound();",
      "  return new Response();",
      "}",
    ].join("\n");
    expect(callsTheGate(callOnly)).toBe(false);
  });

  it("accepts the shape the layout uses", () => {
    const gated = [
      'import { notFound } from "next/navigation";',
      'import { galleryIsAvailable } from "@/lib/gallery/availability";',
      "export function GET() {",
      "  if (!galleryIsAvailable()) notFound();",
      "  return new Response();",
      "}",
    ].join("\n");
    expect(callsTheGate(gated)).toBe(true);
  });
});
