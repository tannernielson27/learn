"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";
import { SessionsLink } from "@/components/recovery/SessionsLink";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * A session's report, when reading or drawing it fails. Without its own boundary the console's
 * would catch this and tell the host an ended session was still running. The answers are rows in
 * the database, so nothing is lost; Try again reads them again.
 */
export default function ReportError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <RouteRecovery
        headline="The report couldn't be loaded."
        detail="The session's results are saved. Try again to load the report."
        onRetry={retry}
        digest={errorDigest(error)}
      >
        <SessionsLink />
      </RouteRecovery>
    </main>
  );
}
