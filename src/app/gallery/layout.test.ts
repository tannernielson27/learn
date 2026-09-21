/**
 * ADR 0003 / #146: the gallery layout is the one choke point all nine `/gallery` routes depend
 * on, so what it does is observed here rather than inferred from its source. Reading the file and
 * matching a regex would pass on a call stranded in an orphaned function, or on one wrapped in
 * `if (DEBUG_DISABLE_GATE)` — exactly the mistakes that would leave the gallery open on
 * production while the test guarding it stayed green. This calls the layout instead.
 *
 * `src/app/gallery/gate.test.ts` covers the other half: that every gallery route goes through
 * this layout in the first place.
 */
import { notFound } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` refuses to run outside a request scope, which a unit test has no way to enter,
// so it is the one thing stubbed here. The stub is not a convenience: the layout awaits it before
// the gate, so counting its calls is how the ordering is checked below.
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection,
}));

/**
 * The error `notFound()` throws, taken from `notFound()` itself rather than written down. Next
 * marks it with `digest: "NEXT_HTTP_ERROR_FALLBACK;404"`; reading it from a live call means this
 * test identifies a real 404 interrupt and keeps doing so if Next ever changes the string.
 */
function notFoundDigest(): string {
  // Typed as returning void so TypeScript does not treat the rest of the function as unreachable.
  const throwNotFound: () => void = notFound;
  try {
    throwNotFound();
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string") return digest;
    throw new Error("notFound() threw an error with no digest to match on");
  }
  throw new Error("notFound() did not throw");
}

const NOT_FOUND = notFoundDigest();

async function renderGalleryLayout(): Promise<unknown> {
  const { default: GalleryLayout } = await import("./layout");
  return GalleryLayout({ children: null, params: Promise.resolve({}) });
}

describe("the gallery layout", () => {
  const saved = process.env.VERCEL_ENV;

  beforeEach(() => {
    connection.mockClear();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved;
  });

  it("refuses to render on the production deployment", async () => {
    process.env.VERCEL_ENV = "production";
    const error = await renderGalleryLayout().then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error, "the layout rendered the gallery on production").toBeDefined();
    expect((error as { digest?: string }).digest).toBe(NOT_FOUND);
  });

  it("waits for a request before deciding, so the answer is not baked into the build", async () => {
    process.env.VERCEL_ENV = "production";
    await renderGalleryLayout().catch(() => undefined);
    // The gate threw on this render. `connection()` can only have been recorded if the layout
    // awaited it first, which is what keeps Next from prerendering this segment and freezing the
    // decision into an artifact that "Promote to Production" could later ship unchanged.
    expect(
      connection,
      "the gate ran before connection(), so it runs at build time",
    ).toHaveBeenCalled();
  });

  it.each(["preview", "development"])("renders on a %s deployment", async (vercelEnv) => {
    process.env.VERCEL_ENV = vercelEnv;
    await expect(renderGalleryLayout()).resolves.toBeTruthy();
    expect(connection).toHaveBeenCalled();
  });

  it("renders where the variable is absent, which is localhost and CI", async () => {
    delete process.env.VERCEL_ENV;
    await expect(renderGalleryLayout()).resolves.toBeTruthy();
  });
});
