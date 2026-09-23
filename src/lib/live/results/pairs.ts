/**
 * The rationale types (dropdown_rationale, dragdrop_rationale): the most common wrong
 * combinations of filled blanks, so the host can see which (condition, cause) pairing the room
 * believes, plus the per-blank counts.
 */
import type { ItemOf } from "@/lib/ngn/schemas";
import {
  countBlanks,
  dragdropDefs,
  dragdropEntries,
  dropdownDefs,
  dropdownEntries,
  readFills,
  type BlankDef,
  type Fills,
} from "./blanks";
import type { CombinationPick, PairsDistribution, WrongCombination } from "./types";

/** How many wrong combinations the host console shows. */
export const COMMON_WRONG_LIMIT = 5;

const isAllCorrect = (defs: readonly BlankDef[], fill: Fills): boolean =>
  defs.every((def) => def.correctId !== undefined && fill.get(def.id) === def.correctId);

function picksOf(defs: readonly BlankDef[], fill: Fills): CombinationPick[] {
  return defs.map((def) => {
    const id = fill.get(def.id);
    const choice = def.choices.find((c) => c.id === id);
    return {
      blankId: def.id,
      choice: choice ? { id: choice.id, label: choice.label, correct: id === def.correctId } : null,
    };
  });
}

/**
 * Wrong combinations, most frequent first; ties keep the order they first arrived in. A response
 * with nothing filled is not a combination, and neither is a fully correct one.
 */
export function commonWrong(
  defs: readonly BlankDef[],
  fills: readonly Fills[],
  limit: number = COMMON_WRONG_LIMIT,
): WrongCombination[] {
  const seen = new Map<string, { fill: Fills; count: number }>();
  for (const fill of fills) {
    if (fill.size === 0 || isAllCorrect(defs, fill)) continue;
    const key = JSON.stringify(defs.map((def) => fill.get(def.id) ?? null));
    const entry = seen.get(key);
    seen.set(key, { fill: entry?.fill ?? fill, count: (entry?.count ?? 0) + 1 });
  }
  return [...seen.values()]
    .map((entry, arrival) => ({ ...entry, arrival }))
    .sort((a, b) => b.count - a.count || a.arrival - b.arrival)
    .slice(0, limit)
    .map((entry) => ({ picks: picksOf(defs, entry.fill), count: entry.count }));
}

function pairsDistribution(
  item: { id: string; type: PairsDistribution["itemType"]; anchorBlankId: string | undefined },
  defs: readonly BlankDef[],
  read: { fills: Fills[]; unreadable: number },
): PairsDistribution {
  return {
    kind: "pairs",
    itemId: item.id,
    itemType: item.type,
    responded: read.fills.length,
    unreadable: read.unreadable,
    anchorBlankId: item.anchorBlankId ?? null,
    blanks: countBlanks(defs, read.fills),
    allCorrect: read.fills.filter((fill) => isAllCorrect(defs, fill)).length,
    commonWrong: commonWrong(defs, read.fills),
  };
}

export function dropdownRationaleDistribution(
  item: ItemOf<"dropdown_rationale">,
  raws: readonly unknown[],
): PairsDistribution {
  const defs = dropdownDefs(item);
  return pairsDistribution(
    { id: item.id, type: item.type, anchorBlankId: item.answerKey.anchorBlankId },
    defs,
    readFills(item.type, raws, defs, dropdownEntries),
  );
}

export function dragdropRationaleDistribution(
  item: ItemOf<"dragdrop_rationale">,
  raws: readonly unknown[],
): PairsDistribution {
  const defs = dragdropDefs(item);
  return pairsDistribution(
    { id: item.id, type: item.type, anchorBlankId: item.answerKey.anchorBlankId },
    defs,
    readFills(item.type, raws, defs, dragdropEntries, !item.content.reusable),
  );
}
