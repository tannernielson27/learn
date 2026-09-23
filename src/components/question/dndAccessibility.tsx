"use client";

import type { Announcements, DndContextProps } from "@dnd-kit/core";
import { useState, type ReactNode } from "react";

/** Callers announce placements in their own status region, so dnd-kit stays silent. */
export const SILENT_ANNOUNCEMENTS: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

export interface SilentDndAccessibility {
  /** Pass to `DndContext`'s `accessibility` prop. */
  accessibility: NonNullable<DndContextProps["accessibility"]>;
  /** Render once, anywhere in the component: the hidden container dnd-kit's markup goes into. */
  sink: ReactNode;
}

/**
 * dnd-kit always renders an assertive live region (and a drag-instructions text) with no option to
 * leave it out. Every drag item here silences dnd-kit's announcements and speaks through its own
 * polite status instead, so that region only ever sat empty in the accessibility tree (#60).
 *
 * It is not removed: dnd-kit keeps writing to it, so taking it away could make an announcement
 * vanish or throw. It is portalled into a `hidden` container instead, out of the accessibility
 * tree. The only things that write to it are the handlers in SILENT_ANNOUNCEMENTS, which return
 * nothing, and dnd-kit ignores an empty announcement, so nothing is lost. Give dnd-kit real
 * announcements again and they would go unheard: move this container back into view first.
 */
export function useSilentDndAccessibility(): SilentDndAccessibility {
  // State, not a ref: dnd-kit renders its markup only after mount, by which time this is set,
  // so the region is never rendered in view, even for one frame.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return {
    accessibility: { announcements: SILENT_ANNOUNCEMENTS, container: container ?? undefined },
    sink: <div hidden ref={setContainer} />,
  };
}
