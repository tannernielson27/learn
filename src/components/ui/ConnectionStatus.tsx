// A type alone, from the module itself: `@/lib/live` value-exports the in-memory room (ADR 0003).
import type { LiveConnection } from "@/lib/live/transport";

export interface ConnectionStatusProps {
  status: LiveConnection;
  className?: string;
}

const LOOK: Record<LiveConnection, { word: string; dot: string }> = {
  connected: { word: "Connected", dot: "bg-correct" },
  reconnecting: { word: "Reconnecting", dot: "bg-flag" },
  offline: { word: "Offline", dot: "bg-flag" },
};

/**
 * A dot and a word for whether this screen can hear the room (PLAN D5, D6). The word carries it;
 * the dot is a second signal, never the only one. A polite status, so a change is read out once
 * without interrupting.
 */
export function ConnectionStatus({ status, className = "" }: ConnectionStatusProps) {
  const { word, dot } = LOOK[status];
  return (
    <p
      role="status"
      data-status={status}
      className={`inline-flex items-center gap-2 text-sm text-ink-2 ${className}`.trim()}
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
      {word}
    </p>
  );
}
