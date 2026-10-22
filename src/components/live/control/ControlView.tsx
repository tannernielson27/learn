"use client";

import Link from "next/link";
import { ChevronLeft, Monitor, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { HostRecord } from "@/components/live/HostRecord";
import type { HostRoom } from "@/components/live/host/useHostRoom";
import { ProgressBoard } from "@/components/live/ProgressBoard";
import { Roster } from "@/components/live/Roster";
import { Badge } from "@/components/ui/Badge";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { textLinkClasses } from "@/components/ui/TextLink";
import type { LiveSessionState } from "@/lib/live";
import type { CaseStudyRun } from "@/lib/live/caseStudyRuns";
import { reportPath } from "@/lib/live/reportFormat";
import { formatSessionCode } from "@/lib/live/sessionCode";
import type { ControlView as ControlViewData } from "@/lib/live/views";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { ControlBar, questions } from "./ControlBar";
import { ControlItem } from "./ControlItem";
import { ControlLobby } from "./ControlLobby";

export interface ControlViewProps {
  sessionId: string;
  title: string;
  code: string;
  studentUrl: string;
  qrCode: ReactNode;
  room: HostRoom;
  view: ControlViewData;
  /** Where the room is, in words (`positionLabel`). */
  position: string | null;
  place: { run: CaseStudyRun; step: number } | null;
  record?: EhrRecord;
  runs: readonly CaseStudyRun[];
  intervalMs: number;
  projectorHref: string;
  onPresent: () => void;
}

const STATUS_BADGE: Record<LiveSessionState["status"], string> = {
  lobby: "Lobby",
  running: "Live",
  paused: "Paused",
  ended: "Ended",
};

/**
 * The teacher's control view of a live session (owner decision 3): names, controls and the
 * private live counts. A top bar with the title, where the room is and whether this screen can
 * hear it; the phase in the middle; every move in one bar at the bottom. Wide from `lg`, one
 * column on a phone with the main action bar at the bottom in thumb reach.
 *
 * What is drawn comes from `controlView` (`src/lib/live/views.ts`), the same function that says
 * what the projector shows, so the two views of one room cannot disagree about its phase.
 */
export function ControlView(props: ControlViewProps) {
  const { title, room, view } = props;
  const { state, connection, error, pending } = room;
  const ended = view.phase === "ended";
  const live = state.status === "running" || state.status === "paused";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface-1">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/author" className={`${textLinkClasses()} shrink-0`}>
              <Icon icon={ChevronLeft} />
              Library
            </Link>
            <span aria-hidden="true" className="h-6 w-px bg-line max-sm:hidden" />
            <h1 className="min-w-0 truncate font-semibold text-ink-1 max-sm:sr-only">{title}</h1>
            <Badge live={state.status === "running"}>{STATUS_BADGE[state.status]}</Badge>
          </div>
          <div className="flex items-center gap-3">
            {live ? (
              <a
                href={props.projectorHref}
                target="_blank"
                rel="noopener"
                className={`${textLinkClasses()} max-sm:hidden`}
              >
                <Icon icon={Monitor} />
                Projector view
              </a>
            ) : null}
            <Link href="/help/instructor#live" className={`${textLinkClasses()} max-sm:hidden`}>
              Help
            </Link>
            <ConnectionStatus status={connection} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* The title reads as the page's heading on a phone, where the top bar has no room. */}
        <p aria-hidden="true" className="font-read text-2xl break-words text-ink-1 sm:hidden">
          {title}
        </p>
        {connection === "connected" ? null : (
          <Notice icon={WifiOff} title="Reconnecting">
            Live updates are paused on this screen. The live session is still open, and students
            stay in it.
          </Notice>
        )}
        {error === null ? null : (
          <Notice role="alert" title="That did not go through">
            {error}
          </Notice>
        )}

        <Phase {...props} />
      </main>

      {ended ? null : (
        <ControlBar
          state={state}
          commands={view.commands}
          busy={pending !== null}
          onCommand={(command) => void room.run(command)}
          summary={
            view.studentPaced
              ? `${questions(state.itemCount)} · Student-paced`
              : questions(state.itemCount)
          }
        />
      )}
    </div>
  );
}

function Phase(props: ControlViewProps) {
  const { sessionId, code, room, view, intervalMs, runs } = props;
  const { state } = room;

  if (view.phase === "lobby") {
    return (
      <ControlLobby
        state={state}
        code={code}
        studentUrl={props.studentUrl}
        qrCode={props.qrCode}
        roster={room.roster}
        busy={room.pending !== null}
        onChoose={(seconds) => void room.chooseTime(seconds)}
        projectorHref={props.projectorHref}
        onPresent={props.onPresent}
      />
    );
  }

  if (view.phase === "ended") {
    return (
      <section aria-labelledby="ended-heading" className="flex max-w-2xl flex-col gap-4">
        <p className="eyebrow">Live session ended</p>
        <h2 id="ended-heading" className="font-read text-3xl text-ink-1">
          This live session has ended.
        </h2>
        <p className="text-ink-2">
          {questions(view.summary.questionsRun)} run · {view.summary.joined} in this session. The
          join code{" "}
          <span data-testid="join-code" className="font-mono text-ink-2 line-through">
            {formatSessionCode(code)}
          </span>{" "}
          no longer works.
        </p>
        <p>
          <Link href={reportPath(sessionId)} className={textLinkClasses()}>
            Open the report
          </Link>
        </p>
      </section>
    );
  }

  if (view.studentPaced) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <p className="eyebrow">Student-paced{state.reveal ? " · Answers showing" : null}</p>
          <ProgressBoard
            ask={room.askProgress}
            itemCount={state.itemCount}
            active={state.status === "running" || state.status === "paused"}
            intervalMs={intervalMs}
          />
          {runs.map((run) =>
            run.record === null ? null : (
              <HostRecord
                key={run.firstPosition}
                record={run.record}
                position={null}
                title={run.title}
                paced
              />
            ),
          )}
        </div>
        <Roster roster={room.roster} />
      </div>
    );
  }

  return (
    <ControlItem
      sessionId={sessionId}
      room={room}
      position={props.position}
      place={props.place}
      {...(props.record === undefined ? {} : { record: props.record })}
      intervalMs={intervalMs}
    />
  );
}
