/**
 * Ordered response: for each position, how many respondents put each item there.
 */
import type { ItemOf } from "@/lib/ngn/schemas";
import { allKnown, countChoices, idSet, noRepeats, readResponses } from "./read";
import type { OrderDistribution } from "./types";

export function orderedResponseDistribution(
  item: ItemOf<"ordered_response">,
  raws: readonly unknown[],
): OrderDistribution {
  const known = idSet(item.content.items);
  const { responses, unreadable } = readResponses(
    item.type,
    raws,
    (r) => noRepeats(r.orderedIds) && allKnown(r.orderedIds, known),
  );
  const key = item.answerKey.orderedIds;
  const positions = item.content.items.map((_, index) => {
    const picks = responses.map((r) => {
      const id = r.orderedIds[index];
      return id === undefined ? [] : [id];
    });
    const correct = key[index];
    return {
      position: index + 1,
      choices: countChoices(item.content.items, picks, new Set(correct ? [correct] : [])),
      unanswered: picks.filter((pick) => pick.length === 0).length,
    };
  });
  const exact = responses.filter(
    (r) => r.orderedIds.length === key.length && r.orderedIds.every((id, i) => id === key[i]),
  ).length;
  return {
    kind: "order",
    itemId: item.id,
    itemType: item.type,
    responded: responses.length,
    unreadable,
    positions,
    exact,
  };
}
