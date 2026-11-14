"use client";

import { Lock, SearchX } from "lucide-react";
import { useId, type ReactNode } from "react";
import { FocusHeading } from "@/components/status/FocusHeading";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { PAGE_TITLE_CLASSES } from "./PageHeader";

/**
 * - `load`: the page or a part of it could not be shown. Says what is still true, offers Try again.
 * - `not-found`: nothing is at this address.
 * - `no-access`: something is here, but not for this account.
 */
export type ErrorStateKind = "load" | "not-found" | "no-access";

/** 1 (the default): the state replaces a whole page, so its heading is the h1 and takes focus. */
export type ErrorStateLevel = 1 | 2 | 3;

interface ErrorStateCommon {
  /** What a reader should know next, in a neutral `Notice`. */
  detail?: ReactNode;
  /** Further ways out, after the main one: links home, to sign in, back to a list. */
  children?: ReactNode;
  level?: ErrorStateLevel;
  className?: string;
}

export interface LoadErrorStateProps extends ErrorStateCommon {
  kind: "load";
  /** What stopped working, in the reader's words. Never the error's own message. */
  headline: string;
  /** What is still true, and what Try again will do. Announced at once, as an alert. */
  detail: ReactNode;
  /** A route's `retry` from Next, or a part of a page's own reload. */
  onRetry: () => void;
  /**
   * The error's `digest`, shown as a reference someone can quote back (#267). A hash Next derives
   * from a server error, matching the server's log line; it carries nothing of the message or the
   * stack. An error thrown in the browser has none, and then nothing is shown.
   */
  digest?: string;
}

export interface NotFoundErrorStateProps extends ErrorStateCommon {
  kind: "not-found";
  headline?: string;
}

export interface NoAccessErrorStateProps extends ErrorStateCommon {
  kind: "no-access";
  headline?: string;
}

export type ErrorStateProps =
  LoadErrorStateProps | NotFoundErrorStateProps | NoAccessErrorStateProps;

const DEFAULTS = {
  "not-found": {
    headline: "This page does not exist.",
    detail: "The link may be old, or the address mistyped.",
    icon: SearchX,
  },
  "no-access": {
    headline: "You do not have access to this page.",
    detail: "Ask whoever shared it to add you, or sign in with another account.",
    icon: Lock,
  },
} as const;

/**
 * What shows in place of something that could not be shown (#164, #267, #563, docs/04 §11
 * "Error"). The headline in the page title's serif, then the detail in a neutral `Notice` (never
 * feedback red, PLAN D11), then the way forward: one large Try again for `load`, and whatever links
 * the page passes. It is handed copy and, at most, a digest, never the error itself, so neither its
 * message nor a stack can reach a student (Sprint 11 kickoff decision 4).
 *
 * At level 1 the heading is the page's h1 and takes focus on arrival, because the state replaces a
 * whole page, heading and all. It arrives with `motion-enter` (opacity and a short lift, collapsed
 * by reduced motion), so it reads as the page changing rather than flashing.
 */
export function ErrorState(props: ErrorStateProps) {
  const { kind, children, level = 1, className = "" } = props;
  const headingId = useId();
  const headline = props.headline ?? DEFAULTS[kind as Exclude<ErrorStateKind, "load">].headline;
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby={headingId}
      data-error-state={kind}
      className={`motion-enter flex min-w-0 flex-col items-start gap-5 ${className}`.trim()}
    >
      {level === 1 ? (
        <FocusHeading id={headingId} className={`${PAGE_TITLE_CLASSES} outline-none`}>
          {headline}
        </FocusHeading>
      ) : (
        <Heading id={headingId} className={PAGE_TITLE_CLASSES}>
          {headline}
        </Heading>
      )}
      {props.kind === "load" ? (
        <>
          {/* The alert is the sentence that says what to do, so a screen reader hears it at once. */}
          <Notice role="alert" className="measure w-full">
            {props.detail}
          </Notice>
          <Button variant="primary" size="lg" onClick={props.onRetry}>
            Try again
          </Button>
          {children}
          {props.digest ? (
            <p className="text-sm text-ink-2">
              Reference <code className="font-mono break-all">{props.digest}</code>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <Notice icon={DEFAULTS[props.kind].icon} className="measure w-full">
            {props.detail ?? DEFAULTS[props.kind].detail}
          </Notice>
          {children}
        </>
      )}
    </section>
  );
}
