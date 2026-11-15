"use client";

import { ErrorState } from "@/components/ui/ErrorState";
import { StatusFrame } from "./StatusFrame";
import { StatusLinks } from "./StatusLinks";

/**
 * The two views with no closer boundary than the root (#164, #267, #563), apart from the
 * segments' views in `RouteErrorViews` so the last-resort `global-error.tsx` stays light: it
 * imports only the status frame, its links and `ErrorState`.
 */
export interface RouteErrorViewProps {
  /** Next's `retry`: asks the server for the segment again, then re-renders it. */
  retry: () => void;
  /** The error's digest, shown as a reference; absent for an error thrown in the browser. */
  digest?: string;
  /**
   * False draws a page that would be its own main as a `div`, for the gallery, whose layout holds
   * the one main. Views drawn inside a layout's `AppShell` have no main of their own.
   */
  landmark?: boolean;
}

/** The line under a headline that has nothing else to say: the reference, or what to do. */
export function referenceLine(digest: string | undefined): string {
  return digest
    ? "Still broken? Share the reference below."
    : // Without a reference, the line that says what to do keeps the alert from standing empty.
      "Try again to load it.";
}

/**
 * Any page with no closer boundary: the public pages, sign-in, join, invites. No `AppShell` frames
 * these, so the status frame brings the wordmark, and the ways out are home and sign in.
 */
export function RootErrorView({ retry, digest, landmark }: RouteErrorViewProps) {
  return (
    <StatusFrame landmark={landmark}>
      <ErrorState
        kind="load"
        headline="This page could not be shown."
        detail={referenceLine(digest)}
        onRetry={retry}
        digest={digest}
      >
        <StatusLinks />
      </ErrorState>
    </StatusFrame>
  );
}

/**
 * The root layout itself failing (`global-error.tsx`). Written for a student as much as a teacher:
 * on a live session's page Try again is the same rejoin the room's own boundary does.
 */
export function GlobalErrorView({ retry, digest, landmark }: RouteErrorViewProps) {
  return (
    <StatusFrame landmark={landmark}>
      <ErrorState
        kind="load"
        headline="This page could not be shown."
        detail="If you were in a live session, your place is kept."
        onRetry={retry}
        digest={digest}
      >
        <StatusLinks />
      </ErrorState>
    </StatusFrame>
  );
}
