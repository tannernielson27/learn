import type { Item } from "@/lib/ngn/schemas";

/**
 * An item as a browser may receive it before its answer is checked: no answer key, no rationale,
 * and no scoring, whose +/- maxPoints is the number of correct answers (#94).
 */
export type KeylessItem = Omit<Item, "answerKey" | "rationale" | "scoring">;

/**
 * The only item payload the play page sends to the browser (ADR 0003). The key, rationale and
 * scoring stay on the server until the score route returns them with a score. Works on a deep
 * copy, so the item it is given is never changed.
 */
export function toKeylessPlayItem(item: Item): KeylessItem {
  const copy = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  delete copy.answerKey;
  delete copy.rationale;
  delete copy.scoring;
  return copy as KeylessItem;
}
