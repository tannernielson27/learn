import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { readLandingEntry } from "@/lib/auth/visitor";

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

export default async function HomePage() {
  return <Landing entry={await readLandingEntry()} />;
}
