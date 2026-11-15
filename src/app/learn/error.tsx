"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { LearnErrorView } from "@/components/status/RouteErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * Any student page that fails to render: the home, an assignment, its results, practice. It sits
 * inside the student layout, so the header and the account menu stay on the screen. `retry` asks
 * the server for the page again. The page shows the digest as a reference, never the message
 * (Sprint 11 kickoff decision 4), as the root boundary does.
 *
 * An error boundary does not catch `notFound()`, and adds no Suspense, so it leaves every 404 here
 * a 404.
 */
export default function LearnError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return <LearnErrorView retry={retry} digest={errorDigest(error)} />;
}
