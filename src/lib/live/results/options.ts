/**
 * multiple_choice and multiple_response: one bar per option.
 */
import type { ItemOf } from "@/lib/ngn/schemas";
import { allKnown, countChoices, countEmpty, idSet, readResponses } from "./read";
import type { OptionsDistribution } from "./types";

export function multipleChoiceDistribution(
  item: ItemOf<"multiple_choice">,
  raws: readonly unknown[],
): OptionsDistribution {
  const known = idSet(item.content.options);
  const { responses, unreadable } = readResponses(item.type, raws, (r) =>
    r.optionId === undefined ? true : known.has(r.optionId),
  );
  const picks = responses.map((r) => (r.optionId === undefined ? [] : [r.optionId]));
  return {
    kind: "options",
    itemId: item.id,
    itemType: item.type,
    selection: "single",
    responded: responses.length,
    unreadable,
    unanswered: countEmpty(picks),
    options: countChoices(item.content.options, picks, new Set([item.answerKey.correctOptionId])),
  };
}

export function multipleResponseDistribution(
  item: ItemOf<"multiple_response">,
  raws: readonly unknown[],
): OptionsDistribution {
  const known = idSet(item.content.options);
  const { responses, unreadable } = readResponses(item.type, raws, (r) =>
    allKnown(r.optionIds, known),
  );
  const picks = responses.map((r) => r.optionIds);
  return {
    kind: "options",
    itemId: item.id,
    itemType: item.type,
    selection: "multiple",
    responded: responses.length,
    unreadable,
    unanswered: countEmpty(picks),
    options: countChoices(item.content.options, picks, new Set(item.answerKey.correctOptionIds)),
  };
}
