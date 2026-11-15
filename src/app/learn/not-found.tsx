import type { Metadata } from "next";
import { LearnNotFoundView } from "@/components/status/NotFoundViews";

export const metadata: Metadata = { title: "Page not found" };

/**
 * A student's `notFound()`: an assignment, its results, a practice quiz or a live session's
 * results that are not there, or not for this student (#563). Without this file the root page drew
 * it, outside the student's `AppShell`. Here the account menu stays, and the way back is the
 * student home. The home's `loading.tsx` is in the `(home)` group, not above this, so it still
 * answers 404 (`src/app/loadingBoundaries.test.ts`).
 */
export default function LearnNotFound() {
  return <LearnNotFoundView />;
}
