"use client";

import { useEffect, useState } from "react";
import { parsePodium, type Podium } from "@/lib/live/podium";
import type { EndSummary } from "@/lib/live/views";
import { StageEnded } from "./StageEnded";
import { StagePodium } from "./StagePodium";

/** Asks for a session's top 5; null for no podium, whatever the reason. */
export type PodiumLoader = (sessionId: string, signal: AbortSignal) => Promise<Podium | null>;

/**
 * Reads the top 5 from `/live/[sessionId]/podium`, with the teacher's own cookies: row level
 * security and the route's host check decide, never a service key. A refusal, a failure or a body
 * it does not recognise is no podium, so the stage keeps its summary.
 */
export const loadPodium: PodiumLoader = async (sessionId, signal) => {
  try {
    const response = await fetch(`/live/${encodeURIComponent(sessionId)}/podium`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
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
 * and the summary (`StageEnded`) until then, or for good when nobody scored. Asked for once, when
 * the stage reaches the end.
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
    void load(sessionId, controller.signal).then((read) => {
      if (!controller.signal.aborted) setPodium(read);
    });
    return () => controller.abort();
  }, [sessionId, load]);

  return podium === null ? (
    <StageEnded title={title} summary={summary} rate={rate} />
  ) : (
    <StagePodium title={title} podium={podium} summary={summary} rate={rate} />
  );
}
