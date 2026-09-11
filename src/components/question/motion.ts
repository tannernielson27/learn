/** Feedback marks never wait longer than this many steps, so the whole reveal ends within 320ms. */
export const MAX_STAGGER = 5;

const isRendered = (el: HTMLElement) => el.offsetParent !== null;

/**
 * Number each visible feedback mark under `root` as `--stagger`, in reading order, for the
 * submit-to-feedback reveal (docs/04-DESIGN-DIRECTION.md §5). Marks in a hidden layout (the other
 * half of a grid and row-card pair) are skipped so the visible ones stagger evenly. globals.css
 * turns the index into an animation delay; reduced motion sets the step to zero.
 */
export function applyStagger(
  root: ParentNode,
  isVisible: (el: HTMLElement) => boolean = isRendered,
): void {
  let index = 0;
  root.querySelectorAll<HTMLElement>("[data-feedback-mark]").forEach((mark) => {
    if (!isVisible(mark)) return;
    mark.style.setProperty("--stagger", String(Math.min(index, MAX_STAGGER)));
    index += 1;
  });
}
