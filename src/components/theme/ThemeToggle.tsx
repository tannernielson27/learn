"use client";

import { useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  THEME_CHOICES,
  applyTheme,
  readTheme,
  serverTheme,
  subscribeTheme,
  type ThemeChoice,
} from "./themeStore";

export { applyTheme, type ThemeChoice };

/** System / light / dark, for the gallery. The account menu offers the same store as a radio group. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const choice = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);

  return (
    <SegmentedControl
      label="Color theme"
      size="sm"
      options={THEME_CHOICES}
      value={choice}
      onChange={applyTheme}
      className={className}
    />
  );
}
