"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ControlView } from "@/components/live/control/ControlView";
import { TALLY_INTERVAL_MS, useHostRoom } from "@/components/live/host/useHostRoom";
import {
  controlPath,
  printedJoinUrl,
  projectorPath,
  type LiveView,
} from "@/components/live/stage/liveView";
import { StageView } from "@/components/live/stage/StageView";
import { isStudentPaced, type LiveHostTransport, type LiveSessionState } from "@/lib/live";
import { runAt, type CaseStudyRun } from "@/lib/live/caseStudyRuns";
import { positionLabel } from "@/lib/live/positionLabel";
import { controlView, stageView } from "@/lib/live/views";
import type { EhrRecord } from "@/lib/ngn/schemas";

export { TALLY_INTERVAL_MS };

export interface HostLobbyProps {
  sessionId: string;
  title: string;
  code: string;
  /** The absolute address the QR code carries, built from the request the host made. */
  studentUrl: string;
  /**
   * The QR code for `studentUrl`, drawn by the page on the server (#297). A node rather than a
   * component here so the encoder never ships to the host's browser or re-runs on each render.
   */
  qrCode: ReactNode;
  /** The projector lobby's join panel (`JoinCode` at stage size), drawn on the server likewise. */
  stageJoin?: ReactNode;
  /** Which of the two views to open on: `?view=projector` asks for the projector. */
  view?: LiveView;
  /** What the server read a moment ago. The console renders from this before it connects. */
  initial: LiveSessionState;
  /** Injectable so this can be driven without Supabase. The page passes nothing. */
  connect?: () => LiveHostTransport;
  /**
   * How often the console asks how many have answered, in milliseconds. Only a test passes it;
   * see `TALLY_INTERVAL_MS`.
   */
  tallyIntervalMs?: number;
  /** Whether the session runs a case study, so the position names the CJMM step (#184). */
  caseStudy?: boolean;
  /**
   * The whole patient record a case-study room was started with (#335), shown to the instructor
   * with a marker for the step the class is on. Absent for a bank.
   */
  record?: EhrRecord;
  /**
   * The case studies a whole-quiz room plays in place (#469), each with its whole record. On one
   * of their steps the console names the case study and the step, and shows that record with the
   * step marker, as a case-study room does; on a loose question, neither.
   */
  runs?: readonly CaseStudyRun[];
}

/** A room with no case study played in place: one list for every render, so nothing reruns. */
const NO_RUNS: readonly CaseStudyRun[] = [];

/** Full screen where the browser allows it; a refusal leaves the projector view in the window. */
function enterFullScreen() {
  try {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {
    // Not offered here (an iframe, an old browser): the window is the stage.
  }
}

function leaveFullScreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  } catch {
    // Nothing to leave.
  }
}

/**
 * A live session for the teacher, in one of its two views (owner decision 3, one route):
 *
 * - the **control view** (`ControlView`): names, controls and the private live counts;
 * - the **projector view** (`StageView`): what the room sees, with no controls, always light.
 *
 * Both are fed by `useHostRoom`, the console's one connection to the room, and both are drawn
 * from `src/lib/live/views.ts`, so the wall and the teacher's screen agree on the phase. A
 * second window opens `?view=projector` and connects on its own; "Present on this screen"
 * switches this window in place, full screen where the browser allows, and Escape (or leaving
 * full screen) comes back. The address follows the view, so a reload keeps it.
 *
 * Keyboard: everything is a native button, link or select in reading order with the focus ring
 * the base layer gives it. Nothing is a click handler on a div, and nothing needs a pointer.
 */
export function HostLobby({
  sessionId,
  title,
  code,
  studentUrl,
  qrCode,
  stageJoin,
  view: firstView = "control",
  initial,
  connect,
  tallyIntervalMs = TALLY_INTERVAL_MS,
  caseStudy = false,
  record,
  runs = NO_RUNS,
}: HostLobbyProps) {
  const room = useHostRoom({ sessionId, initial, connect, tallyIntervalMs });
  const [view, setView] = useState<LiveView>(firstView);
  /** Whether this window went full screen for the projector, so leaving it comes back. */
  const [presenting, setPresenting] = useState(false);

  const show = useCallback(
    (next: LiveView) => {
      setView(next);
      try {
        window.history.replaceState(
          null,
          "",
          next === "projector" ? projectorPath(sessionId) : controlPath(sessionId),
        );
      } catch {
        // The view still switches; only a reload would forget it.
      }
    },
    [sessionId],
  );

  const present = useCallback(() => {
    show("projector");
    setPresenting(true);
    enterFullScreen();
  }, [show]);

  const exit = useCallback(() => {
    setPresenting(false);
    leaveFullScreen();
    show("control");
  }, [show]);

  // The browser's own Escape leaves full screen without a keydown reaching the page.
  useEffect(() => {
    if (!presenting) return;
    const onChange = () => {
      if (!document.fullscreenElement) exit();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [presenting, exit]);

  const { state } = room;
  const paced = isStudentPaced(state);
  // A student-paced room (#185) is on no one item, so there is no position to name, and no one
  // case study's step to name either (#469).
  const place = paced ? null : runAt(runs, state.position);
  const position = paced
    ? null
    : positionLabel(state, {
        caseStudy,
        cjmmStep: room.cjmmStep,
        run: place && { step: place.step, stepCount: place.run.stepCount },
      });
  const input = {
    state,
    code,
    names: room.roster.map((entry) => entry.displayName),
    answered: room.answersOn?.responded ?? null,
    connection: room.connection,
    caseStudy,
    cjmmStep: room.cjmmStep,
    runs,
  };

  if (view === "projector") {
    return (
      <StageView
        title={title}
        code={code}
        url={printedJoinUrl(studentUrl)}
        join={stageJoin}
        room={room}
        view={stageView(input)}
        {...(record === undefined ? {} : { record })}
        runs={runs}
        intervalMs={tallyIntervalMs}
        onExit={exit}
      />
    );
  }

  return (
    <ControlView
      sessionId={sessionId}
      title={title}
      code={code}
      studentUrl={studentUrl}
      qrCode={qrCode}
      room={room}
      view={controlView(input)}
      position={position}
      place={place}
      {...(record === undefined ? {} : { record })}
      runs={runs}
      intervalMs={tallyIntervalMs}
      projectorHref={projectorPath(sessionId)}
      onPresent={present}
    />
  );
}
