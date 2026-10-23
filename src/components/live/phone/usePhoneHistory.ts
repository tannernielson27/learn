"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSessionState } from "@/lib/live/state";
import type { ItemReveal, ParticipantItem } from "@/lib/live/transport";
import type { AnsweredPayload } from "@/lib/liveSupabase/wire";
import { EMPTY_HISTORY, noteItem, parseHistory, type PhoneHistory } from "./history";

/** What the room just told this phone, as far as its history cares. */
export interface HeardView {
  state: LiveSessionState;
  item: ParticipantItem | null;
  answered: AnsweredPayload | null;
  revealed: ItemReveal | null;
}

const storageKey = (sessionId: string, participantId: string) =>
  `learn.live.history.${sessionId}.${participantId}`;

function read(key: string): PhoneHistory {
  try {
    return parseHistory(window.sessionStorage.getItem(key));
  } catch {
    // Storage refused (a private window, blocked site data): the end screen just knows less.
    return EMPTY_HISTORY;
  }
}

/**
 * This phone's history of the session (`history.ts`), kept in the tab's session storage so a
 * reload in the middle of a session does not wipe it. A convenience for the end screen: nothing
 * depends on it, and a browser that refuses storage simply starts from what it sees.
 */
export function usePhoneHistory(sessionId: string, participantId: string) {
  const key = storageKey(sessionId, participantId);
  const [entries, setEntries] = useState<PhoneHistory>(EMPTY_HISTORY);
  /**
   * Whether what an earlier load of this page stored has been folded in. Done with the first
   * view the room sends (`resume` always sends one), never during a render, so the server's
   * first paint and the browser's agree.
   */
  const loaded = useRef(false);

  useEffect(() => {
    if (entries.length === 0) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // As above: nothing is lost that the session itself needs.
    }
  }, [key, entries]);

  const note = useCallback(
    (view: HeardView) => {
      if (!loaded.current) {
        loaded.current = true;
        const stored = read(key);
        if (stored.length > 0) setEntries((held) => stored.reduce(noteItem, held));
      }
      const { state, item } = view;
      if (item === null || state.position === null) return;
      const revealed = view.revealed !== null && view.revealed.itemId === item.id;
      const score = revealed ? (view.revealed?.score ?? null) : null;
      setEntries((held) =>
        noteItem(held, {
          position: state.position as number,
          itemId: item.id,
          cjmmStep: item.cjmmStep ?? null,
          answered: view.answered?.itemId === item.id || score !== null,
          points: score?.points ?? null,
          maxPoints: score?.maxPoints ?? null,
          ...(revealed ? { revealed: true } : {}),
        }),
      );
    },
    [key],
  );

  return { entries, note };
}
