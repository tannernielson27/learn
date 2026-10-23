/**
 * One route, two views (owner decision 3): `/live/[sessionId]` is the teacher's control view, and
 * `/live/[sessionId]?view=projector` is the projector view of the same live session. A second
 * window opens the second address; "Present on this screen" switches the first one in place.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { JOIN_PATH } from "@/lib/live/routes";

export type LiveView = "control" | "projector";

export const VIEW_PARAM = "view";
export const PROJECTOR = "projector";

/** The view a `?view=` search parameter asks for. Anything unknown is the control view. */
export function liveViewOf(param: string | string[] | undefined): LiveView {
  const value = Array.isArray(param) ? param[0] : param;
  return value === PROJECTOR ? "projector" : "control";
}

export function controlPath(sessionId: string): string {
  return `/live/${sessionId}`;
}

export function projectorPath(sessionId: string): string {
  return `${controlPath(sessionId)}?${VIEW_PARAM}=${PROJECTOR}`;
}

/** "learn-nclex.app/join": the address people type, read off the absolute join URL. */
export function printedJoinUrl(studentUrl: string): string {
  try {
    return `${new URL(studentUrl).host}${JOIN_PATH}`;
  } catch {
    return JOIN_PATH;
  }
}
