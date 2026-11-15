import Link from "next/link";
import type { ReactNode } from "react";

import type { EmptyStateAction, EmptyStateContent } from "@/lib/emptyState";
import { buttonClasses } from "./Button";
import { textLinkClasses } from "./TextLink";

export type { EmptyStateAction, EmptyStateContent } from "@/lib/emptyState";

/** Where the empty state's heading sits in its page's outline: one below the list's own heading. */
export type EmptyStateLevel = 2 | 3 | 4;

/**
 * `first-use` (the default): nothing has been made yet, so the state says what goes here and
 * offers the next step. `no-results`: there are things, but a filter or a search hid them all, so
 * it says so in a line and offers to clear it.
 */
export type EmptyStateVariant = "first-use" | "no-results";

export interface FirstUseEmptyStateProps extends EmptyStateContent {
  variant?: "first-use";
  level: EmptyStateLevel;
}

export interface NoResultsEmptyStateProps {
  variant: "no-results";
  /** The short line: "No quizzes match “cardiac”." */
  heading: string;
  /** A link that clears the filter or the search: the same page without its query. */
  action?: EmptyStateAction;
  /**
   * `false` where a status line that is always on the page already says it (a search field's
   * count), so the words are not read twice. Leave it on otherwise.
   */
  live?: boolean;
  /** Or, for a filter held in the page, a button that clears it. */
  onClear?: () => void;
  /** The button's words; "Clear filters" unless the page says better. */
  clearLabel?: string;
}

export type EmptyStateProps = FirstUseEmptyStateProps | NoResultsEmptyStateProps;

const TAGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * The next step's link. One to a place on this page (`#new-quiz-name`) is a plain anchor, so the
 * browser does what it does for any fragment: it scrolls to the field and focuses it, ready to
 * type (#563). The router's own hash handling only scrolls. Anywhere else, the router's `Link`.
 */
function StepLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * An empty list (#266, #563). It sits in the same ruled frame a filled list does, so the region
 * never reads as blank. No icon or illustration, and no motion.
 *
 * - First use: a real heading at the level the page passes, in the serif, and the next step as a
 *   secondary button-link, with any other ways to start beside it as quieter ones. A sentence
 *   under the heading is the exception (#412).
 * - No results: one line in the secondary ink and a way to clear what hid everything. It is a
 *   status, so a screen reader hears it when a search empties the list, and it has no heading: the
 *   list's own heading still names the region.
 */
export function EmptyState(props: EmptyStateProps) {
  if (props.variant === "no-results") return <NoResults {...props} />;
  const { level, heading, body, action, more = [] } = props;
  const Heading = TAGS[level];
  return (
    <div
      data-empty-state="first-use"
      className="flex flex-col items-start gap-1 border-y border-line py-8"
    >
      <Heading className="font-read text-xl leading-snug text-ink-1">{heading}</Heading>
      {body ? <p className="max-w-prose text-ink-2">{body}</p> : null}
      {action ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <StepLink href={action.href} className={buttonClasses({ variant: "secondary" })}>
            {action.label}
          </StepLink>
          {more.map((step) => (
            <Link key={step.href} href={step.href} className={buttonClasses({ variant: "ghost" })}>
              {step.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NoResults({
  heading,
  live = true,
  action,
  onClear,
  clearLabel = "Clear filters",
}: NoResultsEmptyStateProps) {
  return (
    <div
      data-empty-state="no-results"
      className="flex flex-wrap items-center gap-x-4 border-y border-line py-3"
    >
      <p role={live ? "status" : undefined} className="py-2.5 text-ink-2">
        {heading}
      </p>
      {action ? (
        <Link href={action.href} className={textLinkClasses({ size: "sm" })}>
          {action.label}
        </Link>
      ) : onClear ? (
        // Drawn as the link beside it would be, so the two clears line up with the line.
        <button type="button" onClick={onClear} className={textLinkClasses({ size: "sm" })}>
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}
