"use client";

import type { ReactNode } from "react";
import { StatusPanel } from "@/components/status/StatusPanel";
import { Button } from "@/components/ui/Button";

export interface RouteRecoveryProps {
  /** What stopped working, in the reader's words. Never the error's own message. */
  headline: string;
  /** What is still true, and what Try again will do. */
  detail: string;
  /** The segment's `retry` from Next: asks the server for the page again, then re-renders it. */
  onRetry: () => void;
  /**
   * The error's `digest`, shown as a reference someone can quote back (#267). It is a hash Next
   * derives from a server error, and it matches the server's log line; it carries nothing of the
   * message or the stack. An error thrown in the browser has none, and then nothing is shown.
   */
  digest?: string;
  /** Further ways out, after Try again: the root boundaries pass home and sign in. */
  children?: ReactNode;
}

/**
 * What a route's `error.tsx` shows in place of the page that failed (#164).
 *
 * The same panel as the not-found page (`StatusPanel`, #267) and the question renderer's own
 * recovery (#54): the sentence in `ink-1`, the reassurance under it in `ink-2`, one Try again.
 * It is handed copy and, at most, the digest — never the error itself, so neither its message nor
 * a stack can reach a student (Sprint 11 kickoff decision 4). React already reports every caught
 * error through console.error, and `useReportError` sends it to Sentry, so there is no logging
 * here.
 *
 * The heading is an h1, focused on arrival, because every boundary here replaces a whole page,
 * heading and all; the one layout above any of them (authoring's header) has no heading of its own.
 */
export function RouteRecovery({ headline, detail, onRetry, digest, children }: RouteRecoveryProps) {
  return (
    <StatusPanel headline={headline}>
      {/* The alert is the sentence that says what to do, so a screen reader hears it at once. */}
      <p role="alert" className="measure text-ink-2">
        {detail}
      </p>
      <Button onClick={onRetry}>Try again</Button>
      {children}
      {digest ? (
        <p className="text-sm text-ink-2">
          Reference <code className="font-mono break-all">{digest}</code>
        </p>
      ) : null}
    </StatusPanel>
  );
}
