/**
 * Option shuffling for take-home attempts (#209).
 *
 * Two students side by side should not be able to copy an answer by its position. Wherever an
 * item type's order carries no meaning, its lists are permuted by a seed fixed per attempt and
 * item, so a reload or a resume shows the same order. Responses are keyed by option id, never by
 * position, so scoring never notices: a shuffled item scores every response as the original does.
 *
 * Applied on the server to the item it is about to send (usually a `KeylessItem`), never in the
 * browser, so the seed and the original order stay on the server. Pure TypeScript (ADR 0001).
 * docs/01-NGN-ITEM-SPEC.md, "Shuffle", is the source of truth for the rules below.
 */
import type { ItemType } from "./labels";
import { permuteWithPinned } from "./seededRandom";
import type { PlayableItem } from "./submit";

/** What one item type permutes and what it keeps in the author's order, as content paths. */
export interface ShuffleRule {
  /** Lists reordered per attempt; "[]" marks a list inside each element of another list. */
  permuted: readonly string[];
  /** Lists never reordered, because their order is the answer or carries meaning. */
  kept: readonly string[];
}

/**
 * The rule per item type. `shuffleItem` below is what applies them; the tests hold it to this
 * table by checking which lists it actually reorders.
 */
export const SHUFFLE_RULES = {
  multiple_choice: { permuted: ["content.options"], kept: [] },
  multiple_response: { permuted: ["content.options"], kept: [] },
  multiple_response_grouping: {
    permuted: ["content.rows", "content.rows[].options"],
    kept: [],
  },
  matrix_multiple_choice: { permuted: ["content.rows"], kept: ["content.columns"] },
  matrix_multiple_response: { permuted: ["content.rows"], kept: ["content.columns"] },
  dropdown_cloze: {
    permuted: ["content.blanks[].choices"],
    kept: ["content.tokens", "content.blanks"],
  },
  dropdown_rationale: {
    permuted: ["content.blanks[].choices"],
    kept: ["content.tokens", "content.blanks"],
  },
  dropdown_table: {
    permuted: ["content.rows", "content.rows[].choices"],
    kept: ["content.columns"],
  },
  highlight_text: { permuted: [], kept: ["content.passage"] },
  highlight_table: { permuted: [], kept: ["content.columns", "content.rows"] },
  dragdrop_cloze: { permuted: ["content.bank"], kept: ["content.tokens", "content.blanks"] },
  dragdrop_rationale: {
    permuted: ["content.bank"],
    kept: ["content.tokens", "content.blanks"],
  },
  ordered_response: { permuted: [], kept: ["content.items"] },
  bowtie: {
    permuted: ["content.actions", "content.conditions", "content.parameters"],
    kept: ["content.labels"],
  },
} as const satisfies Record<ItemType, ShuffleRule>;

/**
 * Labels that point at other options or at a position ("All of the above", "None of these",
 * "Options A and C", "Choice 2"). The schemas have no "fixed" flag, so these are recognised by
 * their wording and stay where the author put them; everything else in the list moves around them.
 * Deliberately wide: pinning an option that could have moved costs a little shuffling, while
 * moving "All of the above" to the top makes the item nonsense.
 */
const FIXED_LABEL_PATTERNS = [
  /\b(all|none|both|neither|any|either)\s+of\s+(the\s+)?(above|following|these|those|options|choices|answers)\b/i,
  // Capital letters only, so "the answer a nurse gives" stays free to move.
  /\b([Oo]ptions?|[Cc]hoices?|[Aa]nswers?)\s+([A-H]|\d{1,2})\b/,
];

/** Whether an option's wording ties it to its position, so it must not move. */
export function isFixedLabel(label: string): boolean {
  return FIXED_LABEL_PATTERNS.some((pattern) => pattern.test(label));
}

const SEED_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The seed for one attempt at one item: stable across reloads, different per student. */
export function shuffleSeed(attemptId: string, itemId: string): string {
  // The same alphabet as `idSchema`: no `:` or `|`, so the separators below cannot be forged and
  // two different (attempt, item) pairs can never produce the same seed.
  if (!SEED_ID.test(attemptId) || !SEED_ID.test(itemId)) {
    throw new Error("a shuffle seed needs an attempt id and an item id in the id alphabet");
  }
  return `${attemptId}:${itemId}`;
}

/**
 * Each list gets its own seed, derived from the item's seed and the list's name, so adding a list
 * to a type later cannot change the order an existing attempt already shows for the others.
 */
const permute = <L extends { label: string }>(list: readonly L[], seed: string, name: string) =>
  permuteWithPinned(list, `${seed}|${name}`, (entry) => isFixedLabel(entry.label));

type Content = PlayableItem["content"];

function assertNever(value: never): never {
  throw new Error(`no shuffle rule for item type ${JSON.stringify(value)}`);
}

/**
 * The item's content with its permutable lists reordered. The switch is exhaustive: a fifteenth
 * item type does not compile until it says here what, if anything, it shuffles.
 */
function shuffledContent(item: PlayableItem, seed: string): Content {
  switch (item.type) {
    case "multiple_choice":
      return { ...item.content, options: permute(item.content.options, seed, "options") };
    case "multiple_response":
      return { ...item.content, options: permute(item.content.options, seed, "options") };
    case "multiple_response_grouping":
      return {
        ...item.content,
        rows: permute(item.content.rows, seed, "rows").map((row) => ({
          ...row,
          options: permute(row.options, seed, `row:${row.id}|options`),
        })),
      };
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
      return { ...item.content, rows: permute(item.content.rows, seed, "rows") };
    case "dropdown_cloze":
    case "dropdown_rationale":
      return {
        ...item.content,
        blanks: item.content.blanks.map((blank) => ({
          ...blank,
          choices: permute(blank.choices, seed, `blank:${blank.id}|choices`),
        })),
      };
    case "dropdown_table":
      return {
        ...item.content,
        rows: permute(item.content.rows, seed, "rows").map((row) => ({
          ...row,
          choices: permute(row.choices, seed, `row:${row.id}|choices`),
        })),
      };
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return { ...item.content, bank: permute(item.content.bank, seed, "bank") };
    case "bowtie":
      return {
        ...item.content,
        actions: permute(item.content.actions, seed, "actions"),
        conditions: permute(item.content.conditions, seed, "conditions"),
        parameters: permute(item.content.parameters, seed, "parameters"),
      };
    case "highlight_text":
    case "highlight_table":
    case "ordered_response":
      // Position is the answer (the passage, the table, the steps to order): nothing moves. An
      // ordered-response item's steps already arrive in their starting order, never the key's,
      // from `toKeylessItem` (#219); that needs the key, which a keyless item no longer has.
      return item.content;
    default:
      return assertNever(item);
  }
}

/**
 * A new item with the lists its type allows permuted by `seed` (see `shuffleSeed`). Works on a
 * whole item or a keyless one and returns the same kind. The item it is given is never changed;
 * fields the shuffle does not touch (the stem, the patient record) are shared, not copied.
 */
export function shuffleItem<T extends PlayableItem>(item: T, seed: string): T {
  return { ...item, content: shuffledContent(item, seed) } as T;
}
