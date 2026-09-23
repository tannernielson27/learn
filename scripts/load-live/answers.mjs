// #187: made-up answers for the load script's simulated students.
//
// A simulated student holds what a phone holds: the item as `/api/live/view` sends it, with no
// answer key, no rationale and no scoring (ADR 0003). So nothing here can aim for the right answer.
// It picks a shape-valid answer at random — a real choice from the item's own options, the right
// number of picks where the type fixes one — and a crowd of those lands on a natural spread of full,
// partial and no marks. The submit route scores them like any other answer.
//
// Pure and I/O-free, so `answers.test.ts` can prove every answer it makes is one the route accepts.

/** A small seeded generator (mulberry32), so a run can be repeated with `--seed`. */
export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (list) => list.map((entry) => entry.id);

/** An integer in [min, max]. */
const between = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

const pickOne = (rng, list) => list[Math.floor(rng() * list.length)];

/** A shuffled copy; the list it is given is left alone. */
function shuffled(rng, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const pickSome = (rng, list, count) => shuffled(rng, list).slice(0, count);

/** At least one, and rarely everything: how a person answers "select all that apply". */
const pickAny = (rng, list) => pickSome(rng, list, between(rng, 1, Math.max(1, list.length - 1)));

const spansOf = (tokens) => tokens.filter((t) => t.kind === "span").map((t) => t.spanId);

function multipleResponse(content, rng) {
  const options = ids(content.options);
  const count = content.variant === "select_n" && content.n ? content.n : null;
  return { optionIds: count ? pickSome(rng, options, count) : pickAny(rng, options) };
}

function dragdrop(content, rng) {
  const bank = ids(content.bank);
  // A token that is not reusable can sit in one blank only, so those are drawn without replacement.
  const tokens = content.reusable
    ? content.blanks.map(() => pickOne(rng, bank))
    : pickSome(rng, bank, content.blanks.length);
  return { blanks: content.blanks.map((blank, i) => ({ blankId: blank.id, tokenId: tokens[i] })) };
}

const dropdowns = (content, rng) => ({
  blanks: content.blanks.map((b) => ({ blankId: b.id, choiceId: pickOne(rng, ids(b.choices)) })),
});

const BUILDERS = {
  multiple_choice: (content, rng) => ({ optionId: pickOne(rng, ids(content.options)) }),
  multiple_response: multipleResponse,
  multiple_response_grouping: (content, rng) => ({
    rows: content.rows.map((row) => ({ rowId: row.id, optionIds: pickAny(rng, ids(row.options)) })),
  }),
  matrix_multiple_choice: (content, rng) => ({
    rows: content.rows.map((row) => ({
      rowId: row.id,
      columnId: pickOne(rng, ids(content.columns)),
    })),
  }),
  matrix_multiple_response: (content, rng) => ({
    rows: content.rows.map((row) => ({
      rowId: row.id,
      columnIds: pickAny(rng, ids(content.columns)),
    })),
  }),
  dropdown_cloze: dropdowns,
  dropdown_rationale: dropdowns,
  dropdown_table: (content, rng) => ({
    rows: content.rows.map((row) => ({ rowId: row.id, choiceId: pickOne(rng, ids(row.choices)) })),
  }),
  highlight_text: (content, rng) => ({ spanIds: pickAny(rng, spansOf(content.passage)) }),
  highlight_table: (content, rng) => ({
    spanIds: pickAny(
      rng,
      content.rows.flatMap((row) => row.cells.flatMap(spansOf)),
    ),
  }),
  dragdrop_cloze: dragdrop,
  dragdrop_rationale: dragdrop,
  ordered_response: (content, rng) => ({ orderedIds: shuffled(rng, ids(content.items)) }),
  bowtie: (content, rng) => ({
    actionIds: pickSome(rng, ids(content.actions), 2),
    conditionId: pickOne(rng, ids(content.conditions)),
    parameterIds: pickSome(rng, ids(content.parameters), 2),
  }),
};

/**
 * A random, shape-valid answer to a keyless item. Reads `type` and `content` and nothing else: the
 * key is never there on a participant's item, and this does not go looking for it on one that has.
 */
export function randomResponse(item, rng) {
  const build = BUILDERS[item.type];
  if (!build) throw new Error(`No answer generator for item type "${item.type}".`);
  return { type: item.type, ...build(item.content, rng) };
}
