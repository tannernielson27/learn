/**
 * ADR 0003 allows client-side scoring "only in the gallery and fixture modes, which have no real
 * students". Until #146 that exception was held by convention: every route under `/gallery`
 * renders a canonical fixture together with its answer key, and nothing stopped one being opened
 * on the deployment that real students use.
 *
 * The boundary is the production deployment, and nothing else. Previews, CI and localhost are
 * where the gallery is actually used — sprint demos, the Playwright screenshot and axe run,
 * reviewers opening a route on a phone — and none of them has a real student on it. Gating those
 * too would force the screenshot run to authenticate for no security gain.
 */

/**
 * Vercel's own signal for the deployment kind: "production", "preview" or "development". It is a
 * system environment variable, so the platform sets it and a build cannot talk itself into
 * another value (https://vercel.com/docs/environment-variables/system-environment-variables).
 *
 * `NODE_ENV` is deliberately not used here. Next sets it to "production" for every optimized
 * build, preview deployments included, so reading it would take the gallery away from the places
 * that need it.
 */
const PRODUCTION = "production";

/**
 * Whether the gallery routes may render in this deployment.
 *
 * Absent means yes. The variable exists only on Vercel, so anywhere it is missing — `next dev`,
 * `next build` in CI, `next start` on a laptop — is a place with no real students. Production is
 * the one environment where the platform guarantees the value, which is the only guarantee this
 * gate needs.
 */
export function galleryIsAvailable(vercelEnv = process.env.VERCEL_ENV): boolean {
  return vercelEnv !== PRODUCTION;
}

/** The URL prefix the whole gallery lives under. The proxy matcher below must agree with it. */
const GALLERY = "/gallery";

/**
 * Whether this request path belongs to the gallery.
 *
 * Matched on the path alone, before anything renders, because that is the only place the answer
 * key can be withheld. An in-render `notFound()` is too late: a layout and the page beneath it
 * render concurrently, so refusing in the layout does not stop the page subtree that has already
 * rendered from being serialized into the same Flight stream — the response carries a 404 status
 * and the fixtures together (#146, measured at 21KB with two `answerKey` objects in it).
 */
export function isGalleryPath(pathname: string): boolean {
  return pathname === GALLERY || pathname.startsWith(`${GALLERY}/`);
}
