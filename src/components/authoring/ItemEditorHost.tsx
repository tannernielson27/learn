"use client";

import { createContext, useContext, useEffect } from "react";
import type { EhrRecord } from "@/lib/ngn/schemas";

/** Where an editor is open: on its own page, or as a step of a case study. */
export interface ItemEditorHost {
  /** Inside a case study the case study owns the record, so an item offers none of its own. */
  inCaseStudy: boolean;
  /** The case study's record, previewed with the item as a student reads it. */
  record?: EhrRecord | null;
  /** Told whenever the editor gains or loses unsaved changes, so leaving can ask first. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Told whenever a save or publish starts or ends, so nothing replaces the editor mid-request. */
  onBusyChange?: (busy: boolean) => void;
  /** Told when a step has just been started, so focus can stay with the step it replaced. */
  onStepStarted?: () => void;
  /**
   * The saved draft, when the editor opens on something else (a restored version), so what it
   * opened with counts as unsaved changes. Read once, when the editor mounts.
   */
  savedValues?: unknown;
}

const STANDALONE: ItemEditorHost = { inCaseStudy: false };

export const ItemEditorHostContext = createContext<ItemEditorHost>(STANDALONE);

export function useItemEditorHost(): ItemEditorHost {
  return useContext(ItemEditorHostContext);
}

/** Reports an editor's unsaved state to its host, and clears it when the editor goes away. */
export function useReportDirty(dirty: boolean): void {
  const { onDirtyChange } = useItemEditorHost();
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}
