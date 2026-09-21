"use client";

import { createContext, useContext, useLayoutEffect } from "react";

/**
 * Told whether the question itself is on screen: true once a renderer has loaded and been shown,
 * false while the loading placeholder or the load-failure message stands in its place.
 *
 * Since renderers load per type (#54), Submit cannot rely on the answer alone. An ordered response
 * opens already arranged, so its answer is complete before the student has seen it; without this,
 * Submit would be live over the placeholder and would send an order nobody chose. The player
 * provides the callback and gates Submit on it. Outside a player nothing listens.
 */
export const RendererShownContext = createContext<(shown: boolean) => void>(() => {});

/**
 * Rendered beside a renderer inside the same Suspense boundary, so it commits only when the
 * renderer does, and unmounts when an error boundary replaces the renderer with its message.
 * A layout effect, so Submit changes in the same commit that shows the question, and so it is
 * switched off again if the boundary ever hides the question behind its placeholder.
 */
export function RendererShownMarker() {
  const report = useContext(RendererShownContext);
  useLayoutEffect(() => {
    report(true);
    return () => report(false);
  }, [report]);
  return null;
}
