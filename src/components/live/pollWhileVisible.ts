/**
 * Runs `ask` at once and then every `intervalMs`, but only while the tab is visible (#323).
 *
 * The host console's three polls (the tally, the results panel and the progress board) each call
 * this from inside their own effect, in place of `ask(); setInterval(ask, intervalMs)`, and call
 * what it returns from their cleanup. While the tab is visible nothing differs from that pair. While
 * it is hidden nothing is asked; when it comes back, `ask` runs once at once and the cadence starts
 * again from there. A tab that is hidden when the poll starts asks nothing until it is shown.
 *
 * It does nothing to the Realtime channel, which must stay open while the tab is hidden: closing it
 * would mark every student Away. Guarding a resolve that lands after cleanup stays with the caller.
 */
export function pollWhileVisible(ask: () => void, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const resume = () => {
    if (timer !== null) return;
    ask();
    timer = setInterval(ask, intervalMs);
  };
  const pause = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  const follow = () => {
    if (document.visibilityState === "hidden") pause();
    else resume();
  };

  document.addEventListener("visibilitychange", follow);
  follow();
  return () => {
    document.removeEventListener("visibilitychange", follow);
    pause();
  };
}
