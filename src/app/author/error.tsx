"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * Any authoring page that fails to render (#164). It sits inside the authoring layout, so the
 * header — the way back to the banks, and Sign out — stays on the screen. `retry` asks the server
 * for the page again, which is also what reloads anything saved since.
 */
export default function AuthorError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <ReadingWidth>
      <RouteRecovery
        headline="This page could not be shown."
        detail="Unsaved changes may be lost."
        onRetry={retry}
        digest={errorDigest(error)}
      />
    </ReadingWidth>
  );
}
