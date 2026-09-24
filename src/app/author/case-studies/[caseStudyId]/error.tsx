"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";

/**
 * The case study builder — steps, the EHR editor and the preview with its tabs and step
 * navigation — when it fails to render (#164). Closer than authoring's own boundary so the copy
 * can say what was lost: steps are saved one at a time, so an unsaved one is the risk.
 */
export default function CaseStudyError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <RouteRecovery
      headline="The case study builder stopped working."
      detail="Saved steps are safe. Try again to reload the builder; a step you had not saved may be lost."
      onRetry={retry}
    />
  );
}
