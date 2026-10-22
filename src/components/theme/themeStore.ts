/**
 * The colour theme a person chose for this browser: System, Light or Dark (owner decision 9).
 *
 * One small store, read by the account menu and the gallery's toggle alike. The choice lives in
 * `localStorage` under one key; "system" is stored as nothing at all, so a person who never chose
 * follows their device. `data-theme` on `<html>` is what the tokens read (`src/styles/tokens.css`).
 *
 * The root layout applies a stored choice before first paint with `THEME_BOOT_SCRIPT`, an inline
 * script, as `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`
 * describes, so a dark page never flashes light. Every storage call is wrapped: a private window
 * or a blocked site can throw, and then the attribute still applies to this page.
 */

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "learn.theme";
const CHANGE_EVENT = "learn:theme-change";

export const THEME_CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemeChoice; label: string }[];

/** Runs in `<head>` before paint. Anything but "light" or "dark" means "system". */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

/** The stored choice, or "system" when there is none or storage cannot be read. */
export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** For `useSyncExternalStore`: hears a choice made here, and one made in another tab. */
export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** What the server renders: it cannot know the choice, and the boot script fixes the page. */
export function serverTheme(): ThemeChoice {
  return "system";
}

/** Applies a choice to this page and keeps it for this browser. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage may be unavailable (private mode); the attribute still applies for this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
