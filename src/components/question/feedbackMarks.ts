import type { ElementFeedback } from "./types";

/**
 * The one feedback mark every item type draws (docs/04-DESIGN-DIRECTION.md §4, #325): a 4px left
 * rule in `--correct` or `--incorrect` over the soft fill for a chosen element, and a dashed
 * `--correct` border for a missed one. The icon and the word are drawn by the element itself.
 *
 * `edge` is the border colour the element keeps on its other three sides, and when unmarked.
 * `fill` is its background when it is not marked correct or incorrect. Each is left out where it
 * would fight the mark: `border-line*` and `border-transparent` are emitted after `border-correct`,
 * and `bg-surface-1` after `bg-correct-soft`, so either would win the cascade and hide the mark.
 */
export function feedbackMarkClasses(
  state: ElementFeedback,
  edge = "border-line",
  fill = "",
): string {
  switch (state) {
    case "correct":
      return `${edge} border-l-4 border-l-correct bg-correct-soft`;
    case "incorrect":
      return `${edge} border-l-4 border-l-incorrect bg-incorrect-soft`;
    case "missed":
      return `border-dashed border-correct ${fill}`.trim();
    default:
      return `${edge} ${fill}`.trim();
  }
}
