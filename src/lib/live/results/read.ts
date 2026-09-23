/**
 * Reading stored responses and counting choices: the parts every distribution shares.
 */
import { responseSchema, type ItemType, type ResponseOf } from "@/lib/ngn/schemas";
import type { ChoiceCount } from "./types";

export interface ReadResponses<T extends ItemType> {
  responses: ResponseOf<T>[];
  unreadable: number;
}

/**
 * Parses each stored response with the item's own response schema. A response that fails the
 * schema, answers another item type, or fails `fits` (ids the item does not have, a blank filled
 * twice) is counted as unreadable and left out. Nothing here throws.
 */
export function readResponses<T extends ItemType>(
  type: T,
  raws: readonly unknown[],
  fits: (response: ResponseOf<T>) => boolean,
): ReadResponses<T> {
  const responses = raws.flatMap((raw) => {
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success || parsed.data.type !== type) return [];
    const response = parsed.data as ResponseOf<T>;
    return fits(response) ? [response] : [];
  });
  return { responses, unreadable: raws.length - responses.length };
}

/** True when every id is one of `known`. */
export const allKnown = (ids: readonly string[], known: ReadonlySet<string>): boolean =>
  ids.every((id) => known.has(id));

/** True when no id appears twice. */
export const noRepeats = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

export const idSet = (entries: readonly { id: string }[]): ReadonlySet<string> =>
  new Set(entries.map((entry) => entry.id));

/**
 * One count per choice, in the item's order. `picks` holds each respondent's selection; a
 * respondent who picks a choice twice still counts once.
 */
export function countChoices(
  choices: readonly { id: string; label: string }[],
  picks: readonly (readonly string[])[],
  correct: ReadonlySet<string>,
): ChoiceCount[] {
  const tally = new Map<string, number>();
  for (const pick of picks) {
    for (const id of new Set(pick)) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  return choices.map(({ id, label }) => ({
    id,
    label,
    count: tally.get(id) ?? 0,
    correct: correct.has(id),
  }));
}

/** Respondents whose selection is empty. */
export const countEmpty = (picks: readonly (readonly unknown[])[]): number =>
  picks.filter((pick) => pick.length === 0).length;
