import { screen, waitFor } from "@testing-library/react";
import { RENDERER_LOADING } from "../RendererLoading";

/**
 * Resolves once no question on the page is still waiting for its renderer. Renderers load per item
 * type since #54, so the first render of a type in a test file shows the loading placeholder until
 * its module arrives; later renders of that type are immediate. Call this after anything that can
 * put a new item type on the page (a render, a step change) and before querying the item.
 */
export async function renderersLoaded(): Promise<void> {
  await waitFor(
    () => {
      if (screen.queryAllByText(RENDERER_LOADING).length > 0) {
        throw new Error("A question renderer is still loading.");
      }
    },
    // A ceiling, not a delay: it returns as soon as the placeholder goes. The first import of a
    // renderer in a worker is transformed on demand, and under a full parallel run that alone can
    // outlast waitFor's 1s default (the same contention vitest.config's testTimeout allows for).
    { timeout: 10_000 },
  );
}
