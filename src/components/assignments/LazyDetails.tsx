"use client";

import { useState, type ReactNode } from "react";

export interface LazyDetailsProps {
  /** What the `<summary>` shows. */
  summary: ReactNode;
  children: ReactNode;
}

/**
 * A `<details>` whose contents mount only once it is opened, so a class with many assignments does
 * not hydrate an edit form for every row on load. Closing it again keeps what was typed.
 */
export function LazyDetails({ summary, children }: LazyDetailsProps) {
  const [opened, setOpened] = useState(false);
  return (
    <details onToggle={(event) => event.currentTarget.open && setOpened(true)}>
      <summary className="tap-target inline-flex cursor-pointer items-center text-sm font-medium text-accent-ink">
        {summary}
      </summary>
      {opened ? <div className="mt-3">{children}</div> : null}
    </details>
  );
}
