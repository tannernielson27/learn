"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { PlayItemErrorView } from "@/components/status/RouteErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * An item or a case study being played, when the player around the question fails to render
 * (#164): the case study shell's tabs, EHR panel or step navigation. A failed question renderer
 * is caught closer than this, in the question area (#54). A case study keeps its steps in memory,
 * so the honest thing to say is that Try again starts it over.
 */
export default function PlayItemError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return <PlayItemErrorView retry={retry} digest={errorDigest(error)} />;
}
