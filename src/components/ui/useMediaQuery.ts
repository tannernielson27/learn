"use client";

import { useCallback, useSyncExternalStore } from "react";

const supported = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * Whether a CSS media query matches right now. The server snapshot is `false`, so use it only for
 * decisions taken after an interaction; anything visible on first paint belongs in CSS, where it
 * cannot flash between the server's guess and the browser's answer.
 */
export function useMediaQuery(query: string): boolean {
  // Stable across renders, or React would drop and re-add the listener on every one of them.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => supported() && window.matchMedia(query).matches,
    () => false,
  );
}
