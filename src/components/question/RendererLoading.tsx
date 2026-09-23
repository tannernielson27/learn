/** What a screen reader hears while a renderer loads; tests wait for it to go (#54). */
export const RENDERER_LOADING = "Loading the question";

/**
 * Held in the question's place while its renderer's chunk loads (#54). It reserves roughly a
 * short item's height so the Submit bar does not jump far when the renderer arrives, and it stays
 * still: no shimmer, so there is nothing for reduced motion to switch off. On a server-rendered page
 * the item streams in right behind it in the same response; it is mostly seen when a client-side
 * change (a new step, a new live item) brings a type whose chunk has not loaded yet.
 */
export function RendererLoading() {
  return (
    // Busy rather than a live region: the page's own status line (a reconnect notice, say) stays
    // the only thing announced, and a screen reader landing here hears why it is empty.
    <div
      aria-busy="true"
      className="min-h-48 rounded-md border border-dashed border-line bg-surface-2"
    >
      <span className="sr-only">{RENDERER_LOADING}</span>
    </div>
  );
}
