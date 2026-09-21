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

const HTTP_METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

/** The opening brace of each exported HTTP handler, in either declaration style. */
const EXPORTED_HANDLERS = new RegExp(
  `export\\s+(?:async\\s+)?function\\s+(?:${HTTP_METHODS})\\s*\\([\\s\\S]*?\\)\\s*\\{` +
    `|export\\s+const\\s+(?:${HTTP_METHODS})\\s*(?::[^=]+)?=\\s*(?:async\\s*)?\\([\\s\\S]*?\\)\\s*(?::[^=]+)?=>\\s*\\{`,
  "g",
);

/**
 * The gate as the opening statements of a handler body, optionally preceded by `await
 * connection()`. Requiring it *first* is what makes this more than a grep: a call sitting inside
 * `if (DEBUG_DISABLE_GATE) { … }`, or stranded in a sibling function nobody calls, is not the
 * first statement of an exported handler and is rejected.
 */
const OPENS_WITH_GATE =
  /^\s*(?:await\s+connection\s*\(\s*\)\s*;\s*)?if\s*\(\s*!\s*galleryIsAvailable\s*\(\s*\)\s*\)\s*\{?\s*notFound\s*\(\s*\)\s*;/;

/**
 * Whether a gallery route handler refuses production before doing anything else.
 *
 * Route handlers are the one gallery route Next calls directly, with no layout above them, so
 * they have to carry the gate themselves. There is no function to invoke the way
 * `layout.test.ts` invokes the layout — the file does not exist yet — so this reads the source,
 * but only inside each exported handler's body and only at its head. Anything it cannot
 * recognise as a gated handler is rejected, so an unfamiliar shape fails closed.
 */
function handlerRefusesProduction(source: string): boolean {
  const code = withoutComments(source);
  const importsPredicate =
    /import\s*\{[^}]*\bgalleryIsAvailable\b[^}]*\}\s*from\s*["']@\/lib\/gallery\/availability["']/.test(
      code,
    );
  const importsNotFound =
    /import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(code);
  if (!importsPredicate || !importsNotFound) return false;

  const bodies = [...code.matchAll(EXPORTED_HANDLERS)].map((match) =>
    code.slice(match.index + match[0].length),
  );
  // No recognisable handler means nothing was checked, which is not the same as being safe.
  return bodies.length > 0 && bodies.every((body) => OPENS_WITH_GATE.test(body));
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

  it("no gallery route handler slips past, since layouts do not wrap them", () => {
    // Empty today. When the first one arrives it has to refuse production on its own, because
    // Next calls a route handler directly and src/app/gallery/layout.tsx never runs for it.
    // What the layout itself does is observed in src/app/gallery/layout.test.ts, which calls it.
    const ungated = galleryHandlers
      .filter((file) => !handlerRefusesProduction(readFileSync(file, "utf8")))
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

  const IMPORTS = [
    'import { notFound } from "next/navigation";',
    'import { connection } from "next/server";',
    'import { galleryIsAvailable } from "@/lib/gallery/availability";',
  ];
  const handler = (...body: string[]) =>
    [...IMPORTS, "export async function GET() {", ...body, "  return new Response();", "}"].join(
      "\n",
    );

  it("accepts a handler that refuses production first", () => {
    expect(
      handlerRefusesProduction(
        handler("  await connection();", "  if (!galleryIsAvailable()) notFound();"),
      ),
    ).toBe(true);
    // The gate without connection() is still a gate for a route handler, which is never
    // prerendered the way a page is.
    expect(handlerRefusesProduction(handler("  if (!galleryIsAvailable()) notFound();"))).toBe(
      true,
    );
  });

  it("does not accept a file that only talks about the gate", () => {
    const prose = [
      "// The gallery is closed on production: galleryIsAvailable() decides, notFound() answers.",
      "export async function GET() { return new Response(); }",
    ].join("\n");
    expect(handlerRefusesProduction(prose)).toBe(false);
  });

  it("does not accept an import without a call, or a call without the import", () => {
    expect(handlerRefusesProduction(handler())).toBe(false);

    const callOnly = [
      "export async function GET() {",
      "  if (!galleryIsAvailable()) notFound();",
      "  return new Response();",
      "}",
    ].join("\n");
    expect(handlerRefusesProduction(callOnly)).toBe(false);
  });

  it("does not accept a gate that a flag can switch off", () => {
    // The leftover-debug-flag mistake. The call is present, imported and spelled correctly, and
    // the gallery is wide open. A checker that searches the whole file passes this.
    const flagged = handler(
      "  const DEBUG_DISABLE_GATE = false;",
      "  if (DEBUG_DISABLE_GATE) {",
      "    if (!galleryIsAvailable()) notFound();",
      "  }",
    );
    expect(handlerRefusesProduction(flagged)).toBe(false);
  });

  it("does not accept a gate stranded in a function nobody calls", () => {
    // What a half-finished refactor leaves behind: the guard survives, the handler no longer
    // reaches it.
    const orphaned = [
      ...IMPORTS,
      "function guard() {",
      "  if (!galleryIsAvailable()) notFound();",
      "}",
      "export async function GET() {",
      "  return new Response();",
      "}",
    ].join("\n");
    expect(handlerRefusesProduction(orphaned)).toBe(false);
  });

  it("does not accept a gate on only some of the handlers", () => {
    const partial = [
      ...IMPORTS,
      "export async function GET() {",
      "  if (!galleryIsAvailable()) notFound();",
      "  return new Response();",
      "}",
      "export async function POST() {",
      "  return new Response();",
      "}",
    ].join("\n");
    expect(handlerRefusesProduction(partial)).toBe(false);
  });

  it("does not accept a handler shape it cannot read, rather than assuming it is safe", () => {
    const unfamiliar = [
      ...IMPORTS,
      "const handlers = { GET: () => new Response() };",
      "export const { GET } = handlers;",
    ].join("\n");
    expect(handlerRefusesProduction(unfamiliar)).toBe(false);
  });
});
