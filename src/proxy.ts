import { NextResponse, type NextRequest } from "next/server";
import { redirectForAccess } from "@/lib/auth/routeAccess";
import { galleryIsAvailable, isGalleryPath } from "@/lib/gallery/availability";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * ADR 0003 / #146: the gallery ships answer keys to the browser by design, so it is closed on the
 * production deployment. The check has to happen here, because the proxy "executes before routes
 * are rendered" — nothing renders, so there is nothing to serialize and nothing to leak.
 *
 * It was first written as `notFound()` in `src/app/gallery/layout.tsx` and that is not enough. A
 * layout and the page beneath it render concurrently; `notFound()` ends the segment it is thrown
 * in, but the page subtree had already rendered and went out in the same Flight stream. The
 * response was a real 404 whose body still held the fixtures: 21KB with two `answerKey` objects
 * for `/gallery/items/multiple_choice`, 30KB with six for `/gallery/case-study`. The layout gate
 * is kept as a second layer, not as the boundary.
 */
function galleryClosed(): NextResponse {
  // No markup and no data. Anything rendered here would be one more thing to have to audit.
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function proxy(request: NextRequest) {
  const url = new URL(request.url);

  // Before `updateSession`, deliberately. The gallery never needed a session in either direction,
  // and answering here keeps the "no auth round trip" the matcher comment below is about.
  if (isGalleryPath(url.pathname)) {
    return galleryIsAvailable() ? NextResponse.next() : galleryClosed();
  }

  const { response, signedIn } = await updateSession(request);
  const target = redirectForAccess(url, signedIn);
  if (!target) return response;

  // Carry any refreshed session cookies onto the redirect.
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

// Only the routes that care about a session, plus the gallery, which is here for the opposite
// reason: it is turned away above before any session work happens.
export const config = {
  matcher: ["/author/:path*", "/sign-in", "/auth/:path*", "/gallery", "/gallery/:path*"],
};
