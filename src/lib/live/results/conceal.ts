/**
 * What the host console may draw before the answer is showing (#180).
 *
 * A console is often on a projector, so the correct choice must not be marked before the host
 * reveals it. The host's own process holds the key anyway (it holds the whole item), so this is
 * not a secret being kept from the host: it is a projected screen not giving the answer away.
 * The components also hide the key-derived lines until reveal; this is the second lock, applied
 * to the data, so a component that forgot would still have nothing to mark.
 */
import type { ChoiceCount, Distribution } from "./types";

const unmark = (choices: readonly ChoiceCount[]): ChoiceCount[] =>
  choices.map((choice) => ({ ...choice, correct: false }));

/**
 * The same distribution with every choice marked not-correct, and with the counts only the key
 * could produce (the common wrong combinations, how many were entirely right) emptied. Every other
 * count is kept. Never mutates its input.
 */
export function concealKey(distribution: Distribution): Distribution {
  switch (distribution.kind) {
    case "options":
      return { ...distribution, options: unmark(distribution.options) };
    case "grid":
      return {
        ...distribution,
        rows: distribution.rows.map((row) => ({ ...row, cells: unmark(row.cells) })),
      };
    case "blanks":
      return {
        ...distribution,
        blanks: distribution.blanks.map((blank) => ({ ...blank, choices: unmark(blank.choices) })),
      };
    case "slots":
      return {
        ...distribution,
        slots: distribution.slots.map((slot) => ({ ...slot, choices: unmark(slot.choices) })),
      };
    case "order":
      return {
        ...distribution,
        exact: 0,
        positions: distribution.positions.map((position) => ({
          ...position,
          choices: unmark(position.choices),
        })),
      };
    case "pairs":
      return {
        ...distribution,
        allCorrect: 0,
        commonWrong: [],
        blanks: distribution.blanks.map((blank) => ({ ...blank, choices: unmark(blank.choices) })),
      };
  }
}

/** A count as a whole percent of `total`; nought when nobody has answered. */
export function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/** A count as a fraction of `total`, clamped to 0..1: the length of a bar. */
export function shareOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, count / total));
}
