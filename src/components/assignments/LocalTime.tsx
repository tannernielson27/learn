"use client";

import { formatInstant } from "@/lib/assignments/assignments";
import { useHydrated } from "./useHydrated";

export interface LocalTimeProps {
  /** An instant, as stored. */
  iso: string;
}

/**
 * An instant in the viewer's own zone. The server cannot know that zone, so the server render (and
 * the hydration that must match it) says the time in UTC, labelled so; the browser then rewrites it
 * in local time. The machine-readable instant is always on `dateTime`.
 */
export function LocalTime({ iso }: LocalTimeProps) {
  const hydrated = useHydrated();
  return (
    <time dateTime={iso}>
      {hydrated ? formatInstant(iso, "local") : `${formatInstant(iso, "utc")} UTC`}
    </time>
  );
}
