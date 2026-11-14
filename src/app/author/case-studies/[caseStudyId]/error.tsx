"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { errorDigest } from "@/components/status/errorDigest";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * The case study builder — steps, the EHR editor and the preview with its tabs and step
 * navigation — when it fails to render (#164). Closer than authoring's own boundary so the copy
 * can say what was lost: steps are saved one at a time, so an unsaved one is the risk.
 */
export default function CaseStudyError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <ReadingWidth>
      <ErrorState
        kind="load"
        headline="The case study builder stopped working."
        detail="Saved steps are safe. Unsaved changes may be lost."
        onRetry={retry}
        digest={errorDigest(error)}
      />
    </ReadingWidth>
  );
}
