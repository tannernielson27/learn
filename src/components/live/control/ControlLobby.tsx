import type { ReactNode } from "react";
import { Roster } from "@/components/live/Roster";
import { TimeChoice } from "@/components/live/TimerControls";
import { isStudentPaced, type LiveSessionState, type RosterEntry } from "@/lib/live";
import { formatSessionCode } from "@/lib/live/sessionCode";
import { ProjectorNotice } from "./ProjectorNotice";

export interface ControlLobbyProps {
  state: LiveSessionState;
  code: string;
  /** The absolute join address, which the QR code carries. */
  studentUrl: string;
  /** The QR code, drawn on the server (#297). */
  qrCode: ReactNode;
  roster: readonly RosterEntry[];
  busy: boolean;
  onChoose: (seconds: number | null) => void;
  projectorHref: string;
  onPresent: () => void;
}

/**
 * The lobby on the teacher's control view (LobbyControl, LobbyControlPhone mockups): the join
 * code and how to reach it, the projector view, the time per question, and who is in. Two
 * columns from `lg`, one below it with the roster last.
 */
export function ControlLobby({
  state,
  code,
  studentUrl,
  qrCode,
  roster,
  busy,
  onChoose,
  projectorHref,
  onPresent,
}: ControlLobbyProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="code-heading"
          className="flex flex-col gap-6 rounded-md border border-line bg-surface-1 p-5 text-center sm:flex-row sm:items-center sm:p-7 sm:text-left"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <h2 id="code-heading" className="eyebrow">
              Join code
            </h2>
            <p
              data-testid="join-code"
              className="font-mono text-5xl leading-none font-semibold tracking-[0.08em] text-ink-1 tabular lg:text-6xl"
            >
              {formatSessionCode(code)}
            </p>
            <p data-testid="join-url" className="font-mono text-sm break-all text-ink-2">
              {studentUrl}
            </p>
          </div>
          <div className="mx-auto shrink-0 sm:mx-0 [&>svg]:size-40 [&>svg]:rounded-sm [&>svg]:border [&>svg]:border-line">
            {qrCode}
          </div>
        </section>
        <ProjectorNotice projectorHref={projectorHref} onPresent={onPresent} />
        {/* A student-paced room (#185) has no clock per question: each phone keeps its own pace. */}
        {isStudentPaced(state) ? null : (
          <TimeChoice state={state} busy={busy} onChoose={onChoose} />
        )}
      </div>
      <Roster roster={roster} />
    </div>
  );
}
