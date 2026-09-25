"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";
import { errorDigest } from "@/components/status/errorDigest";
import { StatusLinks } from "@/components/status/StatusLinks";

/**
 * Any page with no closer boundary of its own (#267): the student home, the invite and join
 * pages, sign-in. It sits inside the root layout, so the theme holds. `retry` asks the server for
 * the page again. What the error was stays in the server log and Sentry; the page shows only its
 * digest, which matches that log line (Sprint 11 kickoff decision 4).
 */
export default function RootError({ error, retry }: ErrorInfo) {
  useReportError(error);
  const digest = errorDigest(error);
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
      <RouteRecovery
        headline="LeaRN could not show this page."
        detail={
          digest
            ? "Try again to load it. If it keeps happening, pass on the reference below."
            : "Try again to load it."
        }
        onRetry={retry}
        digest={digest}
      >
        <StatusLinks />
      </RouteRecovery>
    </main>
  );
}
