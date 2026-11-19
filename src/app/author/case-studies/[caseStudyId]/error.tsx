"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { CaseStudyErrorView } from "@/components/status/RouteErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * The case study builder — steps, the EHR editor and the preview with its tabs and step
 * navigation — when it fails to render (#164). Closer than authoring's own boundary so the copy
 * can say what was lost: steps are saved one at a time, so an unsaved one is the risk.
 */
export default function CaseStudyError({ error, retry }: ErrorInfo) {
  const eventId = useReportError(error);
  return <CaseStudyErrorView retry={retry} digest={errorDigest(error)} eventId={eventId} />;
}
