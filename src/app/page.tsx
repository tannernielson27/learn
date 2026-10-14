import { captureException } from "@sentry/nextjs";
import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { landingEntry, type LandingVisitor } from "@/lib/auth/landing";
import { readViewer } from "@/lib/classes/viewer";

const TITLE = "LeaRN: live learning for the Next Generation NCLEX";
const DESCRIPTION =
  "Quizzes in every Next Generation NCLEX question format, with live sessions, assignments and " +
  "practice. For nursing teachers and their students.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "LeaRN",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * Who is looking, only to pick the first link. Signed out, `getClaims` finds no session cookie and
 * makes no request, so a visitor costs no Supabase call. Any failure (no Supabase env on a preview,
 * an auth outage) reads as signed out: the page still renders and offers an account and Sign in.
 */
async function readVisitor(): Promise<LandingVisitor> {
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

export default async function HomePage() {
  return <Landing entry={landingEntry(await readVisitor())} />;
}
