import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { landingEntry, type LandingVisitor } from "@/lib/auth/landing";
import { readViewer } from "@/lib/classes/viewer";

const TITLE = "LeaRN: live learning for the Next Generation NCLEX";
const DESCRIPTION =
  "Exam-faithful NGN items, fast authoring, live sessions and take-home assignments for nursing " +
  "instructors and their students. Invite-only.";

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
 * an auth outage) reads as signed out: the page still renders and offers Sign in.
 */
async function readVisitor(): Promise<LandingVisitor> {
  try {
    const viewer = await readViewer();
    return viewer.status === "signed_out" ? viewer : { status: "signed_in", role: viewer.role };
  } catch {
    return { status: "signed_out" };
  }
}

export default async function HomePage() {
  return <Landing entry={landingEntry(await readVisitor())} />;
}
