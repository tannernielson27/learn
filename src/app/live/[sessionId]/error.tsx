"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";
import { SessionsLink } from "@/components/recovery/SessionsLink";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * The host console, when something in it fails to render (#164). The session lives in the
 * database, not in this page, so nothing the students see changes while the console is down. It
 * does not say the session is running: the console of an ended session fails the same way.
 * `retry` (a `router.refresh()` and a reset in one transition) reads the session again on the
 * server and mounts the console fresh, which reopens its channel.
 */
export default function HostError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <RouteRecovery
        headline="The session console stopped working."
        detail="The session itself is not affected; students who joined stay in the room. Try again to bring the console back."
        onRetry={retry}
        digest={errorDigest(error)}
      >
        <SessionsLink />
      </RouteRecovery>
    </main>
  );
}
