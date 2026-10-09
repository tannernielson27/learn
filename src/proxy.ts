import { NextResponse, type NextRequest } from "next/server";
import { redirectForAccess } from "@/lib/auth/routeAccess";
import { galleryIsAvailable, isGalleryPath } from "@/lib/gallery/availability";
import { updateSession } from "@/lib/supabase/proxy";
import { inviteResponseHeaders } from "@/lib/workspace/invite";

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

  const { response, signedIn, homeFor } = await updateSession(request);
  // A workspace invitation's path is its secret: every answer under /w/, the page and the answer
  // to a post alike, tells the browser to send no Referer from it. So does a page that carries the
  // invitation in its own `next`, as /sign-in?next=/w/<token> does.
  for (const [name, value] of Object.entries(inviteResponseHeaders(url.pathname, url.search))) {
    response.headers.set(name, value);
  }
  const access = redirectForAccess(url, signedIn);
  if (!access) return response;

  // The one redirect a signed-in request is ever given is the one off /sign-in. With nowhere
  // asked for it used to name authoring, which sent a student on to /learn and an account with no
  // role on to /welcome: two hops. `homeFor` names that same home here, in one. It decides nothing
  // about access: the pages still check, and it only ever answers where they would have sent the
  // person anyway. It reads one profile row, on this request alone.
  const target = signedIn
    ? new URL(await homeFor(`${access.pathname}${access.search}${access.hash}`), url.origin)
    : access;

  // Carry any refreshed session cookies onto the redirect.
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

// Only the routes that care about a session, plus the gallery, which is here for the opposite
// reason: it is turned away above before any session work happens. The student home and the class
// invite page (#205) read the session in Server Components, which cannot write the refreshed
// cookies themselves, so the refresh has to happen here. The landing page (#264) is the same: it
// reads the session to swap Sign in for the visitor's home. `/` matches the root alone. The
// account pages (#358) read it too, and `redirectForAccess` already counts /account as protected,
// which only works if the proxy runs there. Sign-up and the welcome page (#361) are the same pair:
// /sign-up reads the session to send a signed-in visitor home, and /welcome is protected.
// A workspace invitation, /w/<token>, reads the session as the class invite does, and is also
// here so the proxy can send its Referrer-Policy.
export const config = {
  matcher: [
    "/",
    "/author/:path*",
    "/learn",
    "/learn/:path*",
    "/account",
    "/account/:path*",
    "/c/:path*",
    "/w/:path*",
    "/sign-in",
    "/sign-up",
    "/welcome",
    "/auth/:path*",
    "/gallery",
    "/gallery/:path*",
  ],
};
