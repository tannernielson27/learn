import Link from "next/link";

import type { EmptyStateAction, EmptyStateContent } from "@/lib/emptyState";
import { Button, buttonClasses } from "./Button";
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
  /** Or, for a filter held in the page, a button that clears it. */
  onClear?: () => void;
  /** The button's words; "Clear filters" unless the page says better. */
  clearLabel?: string;
}

export type EmptyStateProps = FirstUseEmptyStateProps | NoResultsEmptyStateProps;

const TAGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * An empty list (#266, #563). It sits in the same ruled frame a filled list does, so the region
 * never reads as blank. No icon or illustration, and no motion.
 *
 * - First use: a real heading at the level the page passes, in the serif, and the next step as a
 *   secondary button-link. A sentence under the heading is the exception (#412).
 * - No results: one line in the secondary ink and a way to clear what hid everything. It is a
 *   status, so a screen reader hears it when a search empties the list, and it has no heading: the
 *   list's own heading still names the region.
 */
export function EmptyState(props: EmptyStateProps) {
  if (props.variant === "no-results") return <NoResults {...props} />;
  const { level, heading, body, action } = props;
  const Heading = TAGS[level];
  return (
    <div
      data-empty-state="first-use"
      className="flex flex-col items-start gap-1 border-y border-line py-8"
    >
      <Heading className="font-read text-xl leading-snug text-ink-1">{heading}</Heading>
      {body ? <p className="max-w-prose text-ink-2">{body}</p> : null}
      {action ? (
        <Link href={action.href} className={`${buttonClasses({ variant: "secondary" })} mt-4`}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function NoResults({
  heading,
  action,
  onClear,
  clearLabel = "Clear filters",
}: NoResultsEmptyStateProps) {
  return (
    <div
      data-empty-state="no-results"
      className="flex flex-wrap items-center gap-x-4 border-y border-line py-3"
    >
      <p role="status" className="py-2.5 text-ink-2">
        {heading}
      </p>
      {action ? (
        <Link href={action.href} className={textLinkClasses({ size: "sm" })}>
          {action.label}
        </Link>
      ) : onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
