"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { waitingCopy, type LiveSessionState, type Participant } from "@/lib/live";
import {
  createParticipantRoom,
  type ParticipantRoom,
  type RoomConnection,
} from "@/lib/liveSupabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** What the room tells this screen. Named so a test can drive it without a socket. */
export interface RoomHandlers {
  onState: (state: LiveSessionState) => void;
  onRoster: (roster: Participant[]) => void;
  onConnection: (status: RoomConnection, rejoined: boolean) => void;
}

export interface StudentRoomProps {
  sessionId: string;
  title: string;
  /** The name the database holds, never the one in the cookie. */
  displayName: string;
  participantId: string;
  /** Epoch milliseconds from the server's clock, so the roster has an order. */
  joinedAt: number;
  /** What the server read a moment ago; the first paint, before any socket opens. */
  initial: LiveSessionState;
  /** Injectable so this can be driven without Supabase. The page passes nothing. */
  connect?: (handlers: RoomHandlers) => ParticipantRoom;
}

/**
 * A student's phone between items (#132).
 *
 * **What is on it and what is not.** A name, the room's title, what the room is doing and how many
 * phones are in it. No item, no options, no answer key — not because they are hidden, but because
 * this connection cannot carry them: it is subscribed to `live.session_public_state`, a table of
 * four columns, and to presence. Showing and answering the item is #133, which is also the story
 * that closes the seam between #129's cookie token and #131's route verifier.
 *
 * **Reconnecting.** Realtime replays nothing, so a phone that slept through a move comes back to a
 * room it thinks is still on item two. The channel re-tracks its presence on every rejoin, and
 * this screen asks the server for the room again — `router.refresh()`, which re-runs the page's
 * server render and hands down a fresh `initial` without touching any state a client component is
 * holding. That last part is why it is a refresh and not a reload: when #133 adds an answer in
 * progress, the answer survives the reconnect.
 *
 * Built at 375px: one column, nothing wider than the screen, and long names wrap rather than
 * pushing the layout sideways.
 */
export function StudentRoom({
  sessionId,
  title,
  displayName,
  participantId,
  joinedAt,
  initial,
  connect,
}: StudentRoomProps) {
  const router = useRouter();
  const [state, setState] = useState<LiveSessionState>(initial);
  const [present, setPresent] = useState(1);
  const [connection, setConnection] = useState<RoomConnection>("connecting");

  /**
   * This phone's presence entry, fixed for the life of the page.
   *
   * `router.refresh()` below renders the page again on every reconnect, and the entry is what the
   * channel is keyed and tracked with — so it is held rather than rebuilt, and a reconnect costs a
   * re-track rather than tearing the channel down and opening a fresh one.
   */
  const [me] = useState(() => ({ participantId, displayName, joinedAt }));

  /**
   * The server is the authority on what the room is doing, and `router.refresh()` below is how
   * this screen asks it again after a reconnect. React's own "adjust state when a prop changes"
   * pattern, during render rather than in an effect: a new `initial` only ever arrives with a new
   * server render, and this is what lets it land instead of being shadowed by whatever the socket
   * last said before it dropped.
   */
  const [applied, setApplied] = useState(initial);
  if (applied !== initial) {
    setApplied(initial);
    setState(initial);
  }

  const dial = useMemo(
    () =>
      connect ??
      ((handlers: RoomHandlers) =>
        createParticipantRoom({
          client: createSupabaseBrowserClient(),
          sessionId,
          me,
          ...handlers,
        })),
    [connect, sessionId, me],
  );

  useEffect(() => {
    let watching = true;
    const room = dial({
      onState: (next) => {
        if (watching) setState(next);
      },
      onRoster: (roster) => {
        if (watching) setPresent(roster.length);
      },
      onConnection: (status, rejoined) => {
        if (!watching) return;
        setConnection(status);
        if (rejoined) router.refresh();
      },
    });
    return () => {
      watching = false;
      // A cleanup cannot await, and a socket that has already dropped must not turn leaving the
      // page into an unhandled rejection in a student's browser.
      void room.leave().catch(() => {});
    };
  }, [dial, router]);

  const copy = waitingCopy(state);

  return (
    <>
      <p className="eyebrow mb-2">Live session</p>
      <h1 className="font-read text-3xl break-words text-ink-1">{title}</h1>
      <p className="mt-4 text-sm text-ink-2">
        Joined as <span className="font-medium break-words text-ink-1">{displayName}</span>
      </p>

      <section aria-labelledby="waiting-heading" className="mt-8">
        {copy.progress === null ? null : <p className="eyebrow mb-2 tabular">{copy.progress}</p>}
        <h2 id="waiting-heading" className="font-read text-2xl text-ink-1">
          {copy.headline}
        </h2>
        <p className="measure mt-2 text-ink-2">{copy.detail}</p>
      </section>

      <p data-testid="room-count" className="tabular mt-8 text-sm text-ink-2">
        {present} in the room
      </p>

      {connection === "reconnecting" ? (
        <p role="status" className="mt-2 text-sm text-ink-2">
          Reconnecting. Stay on this page — your place is kept.
        </p>
      ) : null}
    </>
  );
}
