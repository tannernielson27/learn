let holders = 0;
let previousOverflow = "";

/**
 * Stops the page scrolling behind a dialog, and returns the function that lets it go.
 *
 * Counted, because dialogs stack and need not close in the order they opened: each one saving and
 * restoring `overflow` for itself would unlock the page under a dialog that is still up, or leave
 * it locked after the last one closed. The page's own value comes back when the last holder lets go.
 */
export function lockScroll(): () => void {
  const root = document.documentElement;
  if (holders === 0) {
    previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
  }
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) root.style.overflow = previousOverflow;
  };
}
