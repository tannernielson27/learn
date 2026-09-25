import Link from "next/link";

import type { EmptyStateContent } from "@/lib/emptyState";

export type { EmptyStateAction, EmptyStateContent } from "@/lib/emptyState";

/** Where the empty state's heading sits in its page's outline: one below the list's own heading. */
export type EmptyStateLevel = 2 | 3 | 4;

export interface EmptyStateProps extends EmptyStateContent {
  level: EmptyStateLevel;
}

const TAGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * An empty list (#266): a real heading at the level the page passes, one sentence, and a link to
 * the next step when there is one. It sits in the same ruled frame a filled list does, so the
 * region never reads as blank. No icon or illustration, and no motion.
 */
export function EmptyState({ level, heading, body, action }: EmptyStateProps) {
  const Heading = TAGS[level];
  return (
    <div
      data-empty-state=""
      className="flex flex-col items-start gap-1 border-y border-line px-2 py-4"
    >
      <Heading className="text-base font-medium text-ink-1">{heading}</Heading>
      <p className="max-w-prose text-ink-2">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
