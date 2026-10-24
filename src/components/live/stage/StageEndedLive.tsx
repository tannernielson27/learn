"use client";

import { useEffect, useState } from "react";
import { parsePodium, type Podium } from "@/lib/live/podium";
import type { EndSummary } from "@/lib/live/views";
import { StageEnded } from "./StageEnded";
import { StagePodium } from "./StagePodium";

/** Not yet: the session has not read as ended, or the scores could not be read. Worth asking again. */
export const PODIUM_LATER = "later";

/** Asks for a session's top 5; null for no podium, `PODIUM_LATER` for not yet. */
export type PodiumLoader = (
  sessionId: string,
  signal: AbortSignal,
) => Promise<Podium | null | typeof PODIUM_LATER>;

/** How long to wait before each ask again; at most this many retries, then the summary stays. */
export const PODIUM_RETRY_DELAYS_MS = [1_500, 3_000] as const;

/** A 409 (not ended yet) or a 5xx (scores not readable yet) may clear in a moment. */
const askAgain = (status: number): boolean => status === 409 || status >= 500;

/**
 * Reads the top 5 from `/live/[sessionId]/podium`, with the teacher's own cookies: row level
 * security and the route's host check decide, never a service key. A 409, a 5xx or a network
 * failure is `PODIUM_LATER`: the broadcast can flip the stage to ended a moment before the session
 * row or the last scores catch up. Any other refusal (401, 403, 404) or a body it does not
 * recognise is no podium, so the stage keeps its summary.
 */
export const loadPodium: PodiumLoader = async (sessionId, signal) => {
  let response: Response;
  try {
    response = await fetch(`/live/${encodeURIComponent(sessionId)}/podium`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return askAgain(response.status) ? PODIUM_LATER : null;
  } catch {
    return signal.aborted ? null : PODIUM_LATER;
  }
  try {
    return parsePodium(await response.json());
  } catch {
    return null;
  }
};

export interface StageEndedLiveProps {
  /** Absent where there is no real session behind the stage; the summary is shown. */
  sessionId?: string;
  title: string;
  summary: EndSummary;
  rate: number | null;
  load?: PodiumLoader;
}

/**
 * The end of a live session on the projector: the top 5 (`StagePodium`) once the scores are in,
 * and the summary (`StageEnded`) until then, or for good when nobody scored. Asked for when the
 * stage reaches the end, and asked again only on `PODIUM_LATER`, `PODIUM_RETRY_DELAYS_MS` apart:
 * at most three asks in all, never a poll. Leaving the end stops it.
 */
export function StageEndedLive({
  sessionId,
  title,
  summary,
  rate,
  load = loadPodium,
}: StageEndedLiveProps) {
  const [podium, setPodium] = useState<Podium | null>(null);

  useEffect(() => {
    if (sessionId === undefined) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = (retries: number): void => {
      void load(sessionId, controller.signal).then((read) => {
        if (controller.signal.aborted) return;
        if (read !== PODIUM_LATER) {
          setPodium(read);
          return;
        }
        const delay = PODIUM_RETRY_DELAYS_MS[retries];
        if (delay !== undefined) timer = setTimeout(() => ask(retries + 1), delay);
      });
    };
    ask(0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId, load]);

  return podium === null ? (
    <StageEnded title={title} summary={summary} rate={rate} />
  ) : (
    <StagePodium title={title} podium={podium} summary={summary} rate={rate} />
  );
}
