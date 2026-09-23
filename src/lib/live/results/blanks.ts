/**
 * Drop-down cloze, drop-down table and drag-and-drop cloze: per-blank choice counts. The blank
 * definitions and fills built here are shared with the rationale types (./pairs.ts).
 */
import {
  blankIdsOf,
  type ClozeToken,
  type ItemOf,
  type ItemType,
  type ResponseOf,
} from "@/lib/ngn/schemas";
import { countChoices, noRepeats, readResponses } from "./read";
import type { BlankCounts, BlanksDistribution } from "./types";

export interface BlankDef {
  id: string;
  label: string;
  choices: readonly { id: string; label: string }[];
  correctId: string | undefined;
}

/** One filled blank, whatever the response calls its fields. */
export interface Entry {
  blank: string;
  choice: string;
}

/** One respondent's fills: blank id to choice id. Empty blanks are absent. */
export type Fills = ReadonlyMap<string, string>;

/** Blank definitions for a cloze, labelled "Blank 1", "Blank 2" in reading order. */
export function clozeBlankDefs(
  tokens: readonly ClozeToken[],
  choicesOf: (blankId: string) => readonly { id: string; label: string }[],
  key: readonly { blankId: string; correct: string }[],
): BlankDef[] {
  const correct = new Map(key.map((entry) => [entry.blankId, entry.correct]));
  return blankIdsOf(tokens).map((id, index) => ({
    id,
    label: `Blank ${index + 1}`,
    choices: choicesOf(id),
    correctId: correct.get(id),
  }));
}

/**
 * Parses responses whose entries are `{ [blankField]: blankId, [choiceField]: choiceId }` and
 * turns each into fills. A response that fills a blank twice, names a blank the item does not
 * have, or puts a choice in a blank that does not offer it is unreadable. With `singleUse`, so is
 * one that places the same choice in two blanks: a single-use drag-and-drop bank cannot do that.
 */
export function readFills<T extends ItemType>(
  type: T,
  raws: readonly unknown[],
  defs: readonly BlankDef[],
  entriesOf: (response: ResponseOf<T>) => readonly Entry[],
  singleUse = false,
): { fills: Fills[]; unreadable: number } {
  const offered = new Map(defs.map((def) => [def.id, new Set(def.choices.map((c) => c.id))]));
  const { responses, unreadable } = readResponses(type, raws, (r) => {
    const entries = entriesOf(r);
    return (
      noRepeats(entries.map((entry) => entry.blank)) &&
      (!singleUse || noRepeats(entries.map((entry) => entry.choice))) &&
      entries.every((entry) => offered.get(entry.blank)?.has(entry.choice) === true)
    );
  });
  const fills = responses.map(
    (r) => new Map(entriesOf(r).map((entry) => [entry.blank, entry.choice] as const)),
  );
  return { fills, unreadable };
}

export function countBlanks(defs: readonly BlankDef[], fills: readonly Fills[]): BlankCounts[] {
  return defs.map((def) => {
    const picks = fills.map((fill) => {
      const choice = fill.get(def.id);
      return choice === undefined ? [] : [choice];
    });
    return {
      id: def.id,
      label: def.label,
      choices: countChoices(def.choices, picks, new Set(def.correctId ? [def.correctId] : [])),
      unanswered: picks.filter((pick) => pick.length === 0).length,
    };
  });
}

function blanksDistribution(
  item: { id: string; type: BlanksDistribution["itemType"] },
  defs: readonly BlankDef[],
  read: { fills: Fills[]; unreadable: number },
): BlanksDistribution {
  return {
    kind: "blanks",
    itemId: item.id,
    itemType: item.type,
    responded: read.fills.length,
    unreadable: read.unreadable,
    blanks: countBlanks(defs, read.fills),
  };
}

/** The `{ blankId, choiceId }` entries of a drop-down response. */
export const dropdownEntries = (response: {
  blanks: readonly { blankId: string; choiceId: string }[];
}): Entry[] =>
  response.blanks.map((b) => ({
    blank: b.blankId,
    choice: b.choiceId,
  }));

/** The `{ blankId, tokenId }` entries of a drag-and-drop response. */
export const dragdropEntries = (response: {
  blanks: readonly { blankId: string; tokenId: string }[];
}): Entry[] =>
  response.blanks.map((b) => ({
    blank: b.blankId,
    choice: b.tokenId,
  }));

/** Blank definitions for the drop-down family: each blank offers its own list. */
export function dropdownDefs(
  item: ItemOf<"dropdown_cloze"> | ItemOf<"dropdown_rationale">,
): BlankDef[] {
  const choices = new Map(item.content.blanks.map((blank) => [blank.id, blank.choices]));
  return clozeBlankDefs(
    item.content.tokens,
    (id) => choices.get(id) ?? [],
    item.answerKey.blanks.map((k) => ({ blankId: k.blankId, correct: k.correctChoiceId })),
  );
}

/** Blank definitions for the drag-and-drop family: every blank offers the whole bank. */
export function dragdropDefs(
  item: ItemOf<"dragdrop_cloze"> | ItemOf<"dragdrop_rationale">,
): BlankDef[] {
  return clozeBlankDefs(
    item.content.tokens,
    () => item.content.bank,
    item.answerKey.blanks.map((k) => ({ blankId: k.blankId, correct: k.correctTokenId })),
  );
}

export function dropdownClozeDistribution(
  item: ItemOf<"dropdown_cloze">,
  raws: readonly unknown[],
): BlanksDistribution {
  const defs = dropdownDefs(item);
  return blanksDistribution(item, defs, readFills(item.type, raws, defs, dropdownEntries));
}

export function dragdropClozeDistribution(
  item: ItemOf<"dragdrop_cloze">,
  raws: readonly unknown[],
): BlanksDistribution {
  const defs = dragdropDefs(item);
  return blanksDistribution(
    item,
    defs,
    readFills(item.type, raws, defs, dragdropEntries, !item.content.reusable),
  );
}

export function dropdownTableDistribution(
  item: ItemOf<"dropdown_table">,
  raws: readonly unknown[],
): BlanksDistribution {
  const correct = new Map(item.answerKey.rows.map((row) => [row.rowId, row.correctChoiceId]));
  const defs = item.content.rows.map((row) => ({
    id: row.id,
    label: row.label,
    choices: row.choices,
    correctId: correct.get(row.id),
  }));
  const entries = (response: ResponseOf<"dropdown_table">): Entry[] =>
    response.rows.map((row) => ({ blank: row.rowId, choice: row.choiceId }));
  return blanksDistribution(item, defs, readFills(item.type, raws, defs, entries));
}
