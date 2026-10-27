"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";
import { errorDigest } from "@/components/status/errorDigest";
import { TextLink } from "@/components/ui/TextLink";
import { STUDENT_HOME } from "@/lib/classes/classes";

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
  const digest = errorDigest(error);
  return (
    <RouteRecovery
      headline="This page could not be shown."
      detail={
        digest
          ? "Still broken? Share this reference:"
          : // Without a reference, the line that says what to do keeps the alert from standing empty.
            "Try again to load it."
      }
      onRetry={retry}
      digest={digest}
    >
      <TextLink href={STUDENT_HOME}>Back to your classes</TextLink>
    </RouteRecovery>
  );
}
