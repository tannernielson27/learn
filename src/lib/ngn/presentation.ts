import { emptyResponse } from "./results";
import type { AnyResponse, Item } from "./schemas";
import { startingOrder } from "./startingOrder";
import type { PlayableItem } from "./submit";

/** An ordered-response item as any player holds it: with its key, or keyless from the server. */
interface OrderedSteps {
  id: string;
  content: { items: readonly { id: string }[] };
  answerKey?: { orderedIds: readonly string[] };
}

/**
 * The order an ordered-response item's steps start in (#219). A keyless item came from
 * `toKeylessItem`, which already listed its steps in their starting order on the server, so it is
 * taken as sent: scrambling again here, without the key, could land on the answer. An item that
 * still has its key (the gallery, an author's preview) is scrambled here the same way the server
 * would, seeded by the item id, so both start in the same order.
 */
export function startingIds(item: OrderedSteps): string[] {
  const ids = item.content.items.map((step) => step.id);
  return item.answerKey ? startingOrder(ids, item.answerKey.orderedIds, item.id) : ids;
}

/**
 * The response a player starts from. It is the empty response, except for ordered response, where
 * the order on screen is already an answer, so the player starts from the starting order.
 */
export function initialResponse(item: PlayableItem): AnyResponse {
  if (item.type === "ordered_response") {
    return { type: item.type, orderedIds: startingIds(item) };
  }
  return emptyResponse(item);
}

/**
 * The response a player shows for someone who **did not answer**, once the key is out (#181): a
 * live session's phone that stayed quiet still sees the answer the class is discussing.
 *
 * Nothing chosen, so every element the key names is marked missed and every other is left alone:
 * the key, read off the renderer's own feedback. Ordered response is the exception, because its
 * order on screen is always an answer; the presented order would be marked as a wrong attempt the
 * student never made, so it is laid out in the key's order instead. Reads the key, so it is only
 * ever called with an item whose key has been revealed.
 */
export function unansweredResponse(item: Item): AnyResponse {
  if (item.type === "ordered_response") {
    return { type: item.type, orderedIds: [...item.answerKey.orderedIds] };
  }
  return emptyResponse(item);
}

/**
 * Whether an item is a Trend item: one whose attached record is charted at more than one time,
 * so the panel offers a time selector (docs/01-NGN-ITEM-SPEC.md section 4.2). Trend is a shape an
 * item takes rather than a fifteenth format, so any of the fourteen can be one.
 */
export function isTrendItem(item: Item): boolean {
  return (item.ehr?.timePoints.length ?? 0) > 1;
}
