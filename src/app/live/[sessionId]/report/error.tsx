"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { ReportErrorView } from "@/components/status/RouteErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * A session's report, when reading or drawing it fails. Without its own boundary the console's
 * would catch this and tell the host an ended session was still running. The answers are rows in
 * the database, so nothing is lost; Try again reads them again.
 */
export default function ReportError({ error, retry }: ErrorInfo) {
  const eventId = useReportError(error);
  return <ReportErrorView retry={retry} digest={errorDigest(error)} eventId={eventId} />;
}
