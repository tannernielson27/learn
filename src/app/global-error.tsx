"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";
import { errorDigest } from "@/components/status/errorDigest";
import { StatusLinks } from "@/components/status/StatusLinks";
import "./globals.css";

/**
 * The last boundary: an error in the root layout itself, which no segment's `error.tsx` can catch
 * (#164). It replaces the root layout, so it brings its own document and the global styles. It
 * follows the system theme rather than a stored choice — the theme script belongs to the layout
 * that just failed — and it uses the system font stack for the same reason; the tokens and the
 * panel are otherwise the ones every other boundary uses.
 *
 * Every route's own boundary is closer than this one, so this is seen only when the frame around
 * all of them breaks. The copy is written for a student as much as an instructor: `retry`
 * re-renders from the server, and on a live session's page that is the same rejoin the room's own
 * boundary does (see `play/[sessionId]/error.tsx`). Like the root `error.tsx` (#267) it shows the
 * digest as a reference, never the message, and offers home and sign in as plain links.
 */
export default function GlobalError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-surface-0 text-ink-1">
        <title>LeaRN</title>
        <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
          <RouteRecovery
            headline="LeaRN could not show this page."
            detail="Try again to load it. If you were in a live session, your place is kept."
            onRetry={retry}
            digest={errorDigest(error)}
          >
            <StatusLinks />
          </RouteRecovery>
        </main>
      </body>
    </html>
  );
}
