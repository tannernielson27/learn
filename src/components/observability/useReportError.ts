"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/reportError";

/**
 * Reports the error a route boundary caught, once per error (#235). React 19 does not pass an
 * error a boundary handled on to `window.onerror`, so without this the SDK's global handlers never
 * see it. Does nothing without `NEXT_PUBLIC_SENTRY_DSN`.
 */
export function useReportError(error: unknown): void {
  useEffect(() => {
    void reportClientError(error);
  }, [error]);
}
