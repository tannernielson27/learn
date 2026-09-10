"use client";

import { useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "learn.theme";
const CHANGE_EVENT = "learn:theme-change";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemeChoice; label: string }[];

function readStoredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage may be unavailable (private mode); the attribute still applies for this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Cycles system / light / dark. The root layout's boot script applies the stored choice before paint. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readStoredTheme, () => "system" as ThemeChoice);

  return (
    <SegmentedControl
      label="Color theme"
      size="sm"
      options={OPTIONS}
      value={choice}
      onChange={applyTheme}
      className={className}
    />
  );
}
