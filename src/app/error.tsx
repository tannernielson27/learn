"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RootErrorView } from "@/components/status/RootErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * Any page with no closer boundary of its own (#267): the student home, the invite and join
 * pages, sign-in. It sits inside the root layout, so the theme holds. `retry` asks the server for
 * the page again. What the error was stays in the server log and Sentry; the page shows only its
 * digest, which matches that log line (Sprint 11 kickoff decision 4).
 */
export default function RootError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return <RootErrorView retry={retry} digest={errorDigest(error)} />;
}
