"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "@/lib/observability/reportError";

/**
 * Reports the error a route boundary caught, once per error (#235). React 19 does not pass an
 * error a boundary handled on to `window.onerror`, so without this the SDK's global handlers never
 * see it. Does nothing without `NEXT_PUBLIC_SENTRY_DSN`.
 *
 * Returns Sentry's id for the error once it is reported, and undefined until then or without a
 * DSN, so the error screen's "Tell us about a problem" can attach to it (#568).
 */
export function useReportError(error: unknown): string | undefined {
  const [reported, setReported] = useState<{ error: unknown; eventId: string } | null>(null);
  useEffect(() => {
    let current = true;
    void reportClientError(error)?.then((eventId) => {
      if (current && eventId) setReported({ error, eventId });
    });
    return () => {
      current = false;
    };
  }, [error]);
  // An id belongs to the error it was reported for; a new error starts with none.
  return reported !== null && reported.error === error ? reported.eventId : undefined;
}
