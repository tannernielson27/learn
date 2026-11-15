"use client";

import type { ReactNode } from "react";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { WayBack } from "@/components/recovery/WayBack";
import { ErrorState } from "@/components/ui/ErrorState";
import { type RouteErrorViewProps, referenceLine } from "./RootErrorViews";

/**
 * What each route's `error.tsx` draws (#164, #267, #563), side by side so the copy reads as one
 * voice: a headline that says what stopped, one sentence that says what is still true, Try again,
 * then one way back to the right home. The route files keep the reporting (`useReportError`) and
 * hand these only `retry` and the digest, never the error, so neither its message nor its stack
 * can reach the page. `/gallery/states` draws the same views with no error behind them.
 */
/** A live page outside any `AppShell`: the host console, its report, the student room. */
function LiveFrame({
  width,
  landmark = true,
  children,
}: {
  width: "console" | "room";
  landmark?: boolean;
  children: ReactNode;
}) {
  const Main = landmark ? "main" : "div";
  const size = width === "console" ? "max-w-3xl py-8" : "max-w-lg py-12";
  return <Main className={`mx-auto w-full flex-1 px-4 ${size}`}>{children}</Main>;
}

/** Any teacher page under /author. Inside the teacher's `AppShell`, so the nav stays. */
export function AuthorErrorView({ retry, digest }: RouteErrorViewProps) {
  return (
    <ReadingWidth>
      <ErrorState
        kind="load"
        headline="This page could not be shown."
        detail="Unsaved changes may be lost."
        onRetry={retry}
        digest={digest}
      >
        <WayBack to="library" />
      </ErrorState>
    </ReadingWidth>
  );
}

/** The case study builder: steps save one at a time, so an unsaved one is what is at risk. */
export function CaseStudyErrorView({ retry, digest }: RouteErrorViewProps) {
  return (
    <ReadingWidth>
      <ErrorState
        kind="load"
        headline="The case study builder stopped working."
        detail="Saved steps are safe. Unsaved changes may be lost."
        onRetry={retry}
        digest={digest}
      >
        <WayBack to="library" />
      </ErrorState>
    </ReadingWidth>
  );
}

/** A question or a case study a teacher is playing through. */
export function PlayItemErrorView({ retry, digest }: RouteErrorViewProps) {
  return (
    <ReadingWidth>
      <ErrorState
        kind="load"
        headline="This could not be played."
        detail="Nothing is lost."
        onRetry={retry}
        digest={digest}
      >
        <WayBack to="library" />
      </ErrorState>
    </ReadingWidth>
  );
}

/**
 * The host console. The session lives in the database, so the students' screens do not change
 * while it is down; it does not say the session is running, since an ended one fails the same way.
 */
export function HostErrorView({ retry, digest, landmark }: RouteErrorViewProps) {
  return (
    <LiveFrame width="console" landmark={landmark}>
      <ErrorState
        kind="load"
        headline="This page stopped working."
        detail="Students are still in."
        onRetry={retry}
        digest={digest}
      >
        <WayBack to="sessions" />
      </ErrorState>
    </LiveFrame>
  );
}

/** A live session's report. The answers are rows in the database, so nothing is lost. */
export function ReportErrorView({ retry, digest, landmark }: RouteErrorViewProps) {
  return (
    <LiveFrame width="console" landmark={landmark}>
      <ErrorState
        kind="load"
        headline="The report could not be shown."
        detail="The answers are saved."
        onRetry={retry}
        digest={digest}
      >
        <WayBack to="sessions" />
      </ErrorState>
    </LiveFrame>
  );
}

/**
 * The student room. A class is watching, so the phone says something calm; Try again puts the
 * student back in the same room as the same participant (see `play/[sessionId]/error.tsx`). A
 * guest has no home page, so the way back is the join page.
 */
export function RoomErrorView({ retry, digest, landmark }: RouteErrorViewProps) {
  return (
    <LiveFrame width="room" landmark={landmark}>
      <ErrorState
        kind="load"
        headline="This screen stopped working."
        detail="Your place is kept."
        onRetry={retry}
        digest={digest}
      >
        <WayBack to="join" />
      </ErrorState>
    </LiveFrame>
  );
}

/** Any student page under /learn. Inside the student's `AppShell`, so the account menu stays. */
export function LearnErrorView({ retry, digest }: RouteErrorViewProps) {
  return (
    <ErrorState
      kind="load"
      headline="This page could not be shown."
      detail={referenceLine(digest)}
      onRetry={retry}
      digest={digest}
    >
      <WayBack to="student-home" />
    </ErrorState>
  );
}

// The root views live apart so `global-error.tsx` imports only the frame, the links and ErrorState.
export { GlobalErrorView, RootErrorView, type RouteErrorViewProps } from "./RootErrorViews";
