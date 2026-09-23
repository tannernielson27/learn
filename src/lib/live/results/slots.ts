/**
 * Bowtie: per-slot choice counts. Each slot is counted against its own column of choices.
 */
import type { ItemOf } from "@/lib/ngn/schemas";
import { allKnown, countChoices, countEmpty, idSet, noRepeats, readResponses } from "./read";
import type { SlotCounts, SlotsDistribution } from "./types";

export function bowtieDistribution(
  item: ItemOf<"bowtie">,
  raws: readonly unknown[],
): SlotsDistribution {
  const { actions, conditions, parameters, labels } = item.content;
  const actionIds = idSet(actions);
  const conditionIds = idSet(conditions);
  const parameterIds = idSet(parameters);
  const { responses, unreadable } = readResponses(
    item.type,
    raws,
    (r) =>
      noRepeats(r.actionIds) &&
      allKnown(r.actionIds, actionIds) &&
      (r.conditionId === undefined || conditionIds.has(r.conditionId)) &&
      noRepeats(r.parameterIds) &&
      allKnown(r.parameterIds, parameterIds),
  );
  const slot = (
    id: SlotCounts["id"],
    label: string,
    capacity: number,
    choices: readonly { id: string; label: string }[],
    picks: readonly (readonly string[])[],
    correct: readonly string[],
  ): SlotCounts => ({
    id,
    label,
    capacity,
    choices: countChoices(choices, picks, new Set(correct)),
    unanswered: countEmpty(picks),
  });
  const key = item.answerKey;
  return {
    kind: "slots",
    itemId: item.id,
    itemType: item.type,
    responded: responses.length,
    unreadable,
    slots: [
      slot(
        "actions",
        labels.actions,
        key.actionIds.length,
        actions,
        responses.map((r) => r.actionIds),
        key.actionIds,
      ),
      slot(
        "condition",
        labels.condition,
        1,
        conditions,
        responses.map((r) => (r.conditionId === undefined ? [] : [r.conditionId])),
        [key.conditionId],
      ),
      slot(
        "parameters",
        labels.parameters,
        key.parameterIds.length,
        parameters,
        responses.map((r) => r.parameterIds),
        key.parameterIds,
      ),
    ],
  };
}
