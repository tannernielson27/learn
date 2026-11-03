import { captureException } from "@sentry/nextjs";
import { landingEntry, type LandingEntry, type LandingVisitor } from "./landing";
import { readViewer } from "@/lib/classes/viewer";

/**
 * Who is looking, only to pick the first link (#264; #522 reads it on pricing too). Signed out,
 * `getClaims` finds no session cookie and makes no request, so a visitor costs no Supabase call.
 * Any failure (no Supabase env on a preview, an auth outage) reads as signed out: the page still
 * renders and offers an account and Sign in.
 */
export async function readVisitor(): Promise<LandingVisitor> {
  try {
    const viewer = await readViewer();
    return viewer.status === "signed_out" ? viewer : { status: "signed_in", role: viewer.role };
  } catch (error) {
    // Still reported: a real auth outage should not hide behind a page that renders. Without a DSN
    // (previews, local builds) Sentry is not started and this is a no-op.
    captureException(error);
    return { status: "signed_out" };
  }
}

/** The landing page's first link for whoever is looking (`landingEntry`). */
export async function readLandingEntry(): Promise<LandingEntry> {
  return landingEntry(await readVisitor());
}
