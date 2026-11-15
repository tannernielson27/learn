import type { Metadata } from "next";
import { AuthorNotFoundView } from "@/components/status/NotFoundViews";

export const metadata: Metadata = { title: "Page not found" };

/**
 * A teacher's `notFound()`: a quiz, a class, a report or a question that is not there, or not in
 * this teacher's workspace (#563). Without this file the root page drew it, outside the teacher's
 * `AppShell`, so the nav and the account menu went missing on a wrong link. Here they stay, and
 * the way back is the library. No `loading.tsx` sits above it, so it still answers 404
 * (`src/app/loadingBoundaries.test.ts`).
 */
export default function AuthorNotFound() {
  return <AuthorNotFoundView />;
}
