"use client";

import type { ReactNode } from "react";
import { Dialog } from "./Dialog";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** The heading, and the sheet's accessible name. */
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons for the foot of the sheet. */
  actions?: ReactNode;
  /**
   * `bottom` (the default) rises from the bottom edge: the patient record from a chip on a phone,
   * the teacher's menu. `end` slides in full height from the inline end: a landscape phone, where
   * a bottom sheet would leave no room (PLAN §6).
   */
  side?: "bottom" | "end";
  className?: string;
}

/** A panel over the page, on the same native dialog as every popup (focus, Escape, scroll lock). */
export function Sheet({ side = "bottom", ...rest }: SheetProps) {
  return <Dialog shape={side === "end" ? "sheet-end" : "sheet-bottom"} {...rest} />;
}
