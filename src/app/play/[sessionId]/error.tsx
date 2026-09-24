"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";

/**
 * The student room, when something outside the question renderer fails to render (#164). A class
 * is watching, so the phone says something calm and offers one way back — and that way back has
 * to put the student in the same room as the same participant.
 *
 * **Why `retry` and not `reset`.** Next hands this file both. `reset` only clears the boundary and
 * re-renders `StudentRoom` from the payload the router already holds: the room as it was when the
 * page first loaded, however far the host has moved since. `retry` is `router.refresh()` and
 * `reset()` in one transition (next/dist/client/components/error-boundary.js), so the server
 * component above the room runs again: it reads the httpOnly participant cookie, which nothing on
 * this page can touch; `resume_participant` turns it back into the same participant row (same id,
 * same display name, same join time); and it reads the room's current state. A participant who is
 * no longer one goes to the join form from there, as on any reload.
 *
 * **Why that rejoins the channel.** The error unmounted `StudentRoom`, and its cleanup left the
 * Realtime channel and dropped its presence. The retried render mounts it again with the fresh
 * props, and its effect opens the channel and tracks presence under the same participant id — so
 * the host's roster shows the same one entry again, not a second one. Nobody is asked for a name.
 *
 * What does not survive is anything only the unmounted component held: an answer chosen but not
 * sent. The copy says so rather than promising it.
 */
export default function PlayError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
      <RouteRecovery
        headline="This screen stopped working."
        detail="Your place in the session is kept. Try again to rejoin the room; an answer you had not sent may need choosing again."
        onRetry={retry}
      />
    </main>
  );
}
