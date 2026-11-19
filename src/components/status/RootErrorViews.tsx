"use client";

import type { ReactNode } from "react";
import { EmailSupport } from "@/components/support/EmailSupport";
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
  /** Sentry's id for the error once reported, for "Tell us about a problem" to attach to (#568). */
  eventId?: string;
  /**
   * False draws a page that would be its own main as a `div`, for the gallery, whose layout holds
   * the one main. Views drawn inside a layout's `AppShell` have no main of their own.
   */
  landmark?: boolean;
}

/** The line under a headline that has nothing else to say: the reference, or what to do. */
export function referenceLine(digest: string | undefined): string {
  return digest
    ? // The ways to tell us, and what the reference is for, sit under the buttons (#568).
      "Still broken? Tell us about it!"
    : // Without a reference, the line that says what to do keeps the alert from standing empty.
      "Try again to load it.";
}

/**
 * Any page with no closer boundary: the public pages, sign-in, join, invites. No `AppShell` frames
 * these, so the status frame brings the wordmark, and the ways out are home and sign in.
 */
export function RootErrorView({
  retry,
  digest,
  landmark,
  problem,
}: RouteErrorViewProps & {
  /**
   * The ways to tell us (`ProblemReportLink`: the form if signed in, and the address), handed in by
   * `app/error.tsx` so this file, which the global error page shares, never imports the dialog.
   * Without it, the address alone.
   */
  problem?: ReactNode;
}) {
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
        {problem ?? <EmailSupport reference={digest} />}
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
        {/* Only the address here: this page loads nothing it can do without (#568). */}
        <EmailSupport reference={digest} />
      </ErrorState>
    </StatusFrame>
  );
}
