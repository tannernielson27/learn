import { NextResponse, type NextRequest } from "next/server";
import { redirectForAccess } from "@/lib/auth/routeAccess";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const target = redirectForAccess(new URL(request.url), signedIn);
  if (!target) return response;

  // Carry any refreshed session cookies onto the redirect.
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

// Only the routes that care about a session. The gallery and item player stay proxy-free, so
// they pay no auth round trip.
export const config = {
  matcher: ["/author/:path*", "/sign-in", "/auth/:path*"],
};
