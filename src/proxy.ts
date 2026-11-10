import { NextResponse, type NextRequest } from "next/server";
import { redirectForAccess } from "@/lib/auth/routeAccess";
import { galleryIsAvailable, isGalleryPath } from "@/lib/gallery/availability";
import { updateSession } from "@/lib/supabase/proxy";
import { betaPassResponseHeaders } from "@/lib/betaPass/link";
import { inviteResponseHeaders } from "@/lib/workspace/invitePage";
import { decideGate, type GateDecision } from "@/lib/deviceGate/decide";
import { SESSION_COOKIE } from "@/lib/deviceGate/config";
import { needsSessionWork } from "@/lib/deviceGate/sessionPaths";
import { createGateStore } from "@/lib/deviceGate/store";

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

/**
 * ADR 0017: staging.learnursing.app opens only for a device with a registered passkey. Off the
 * staging host this is one string comparison and `not-gated`; nothing else changes for production.
 */
function gateDecision(request: NextRequest, url: URL): Promise<GateDecision> {
  return decideGate(
    {
      host: request.headers.get("host"),
      pathname: url.pathname,
      search: url.search,
      method: request.method,
      accept: request.headers.get("accept"),
      isRsc: request.headers.has("rsc"),
      sessionToken: request.cookies.get(SESSION_COOKIE)?.value ?? null,
    },
    { isDeviceActive: (deviceId) => createGateStore().isDeviceActive(deviceId) },
  );
}

const NO_INDEX = "noindex, nofollow";

function gateRefusal(decision: GateDecision, url: URL): NextResponse | null {
  const plain = (body: string, status: number) =>
    new NextResponse(body, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": NO_INDEX },
    });
  if (decision.kind === "misconfigured") return plain("Staging is not configured", 503);
  if (decision.kind === "deny") return plain("Unauthorized", 401);
  if (decision.kind === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.location, url.origin));
    redirect.headers.set("x-robots-tag", NO_INDEX);
    return redirect;
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const url = new URL(request.url);

  const gate = await gateDecision(request, url);
  const refusal = gateRefusal(gate, url);
  if (refusal) return refusal;
  if (gate.kind !== "not-gated") {
    // The staging host. Only the paths the session matcher always covered do session work; the
    // rest (the gate page, /api, /terms and the like) go straight through, as they did before.
    if (!needsSessionWork(url.pathname)) {
      const next = NextResponse.next();
      next.headers.set("x-robots-tag", NO_INDEX);
      return next;
    }
  }

  // Before `updateSession`, deliberately. The gallery never needed a session in either direction,
  // and answering here keeps the "no auth round trip" the matcher comment below is about.
  if (isGalleryPath(url.pathname)) {
    return galleryIsAvailable() ? NextResponse.next() : galleryClosed();
  }

  const { response, signedIn, homeFor } = await updateSession(request);
  // A workspace invitation's path is its secret: every answer under /w/, the page and the answer
  // to a post alike, tells the browser to send no Referer from it. So does a page that carries the
  // invitation in its own `next`, as /sign-in?next=/w/<token> does.
  // A beta pass, /b/<token>, is the same kind of secret and gets the same policy (#520).
  const secretLinkHeaders = {
    ...inviteResponseHeaders(url.pathname, url.search),
    ...betaPassResponseHeaders(url.pathname, url.search),
  };
  for (const [name, value] of Object.entries(secretLinkHeaders)) {
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
// here so the proxy can send its Referrer-Policy. A beta pass, /b/<token> (#520), is here for
// both reasons too. Pricing (#522) reads the session for its one link, as the landing page does;
// it is not protected, so a signed-out visitor is let straight through. The terms and the privacy
// policy read nothing and are not here.
// Never `/api/stripe/webhook` (#518): Stripe calls it with no session, and a redirect would lose
// the event. Nothing under /api is matched by the first block; keep it that way.
//
// The last entry is the staging device gate (ADR 0017): every path on staging.learnursing.app but
// the build's static files, so the gate covers pages and /api alike there. It only ever matches
// that host, so production's requests reach the proxy exactly as they did before. The first block
// must stay the same as SESSION_MATCHER in src/lib/deviceGate/sessionPaths.ts (proxy.test.ts).
export const config = {
  matcher: [
    "/",
    "/pricing",
    "/author/:path*",
    "/learn",
    "/learn/:path*",
    "/account",
    "/account/:path*",
    "/c/:path*",
    "/w/:path*",
    "/b/:path*",
    "/sign-in",
    "/sign-up",
    "/welcome",
    "/auth/:path*",
    "/gallery",
    "/gallery/:path*",
    {
      source: "/((?!_next/static/|_next/image(?:/|$)|favicon\\.ico$).*)",
      has: [{ type: "host", value: "staging.learnursing.app" }],
    },
  ],
};
