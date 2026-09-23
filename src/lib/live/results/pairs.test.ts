import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { distributionFor } from "./index";
import { COMMON_WRONG_LIMIT } from "./pairs";
import type { BlankCounts, WrongCombination } from "./types";

const counts = (blanks: BlankCounts[]) =>
  blanks.map((blank) => [
    blank.id,
    blank.unanswered,
    blank.choices.map((choice) => [choice.id, choice.count, choice.correct]),
  ]);

/** Each combination as `[count, ...choice ids or null]`. */
const combos = (wrong: WrongCombination[]) =>
  wrong.map((combo) => [combo.count, ...combo.picks.map((pick) => pick.choice?.id ?? null)]);

const dropdown = (cond?: string, ev1?: string, ev2?: string) => ({
  type: "dropdown_rationale",
  blanks: [
    ...(cond ? [{ blankId: "cond", choiceId: cond }] : []),
    ...(ev1 ? [{ blankId: "ev_1", choiceId: ev1 }] : []),
    ...(ev2 ? [{ blankId: "ev_2", choiceId: ev2 }] : []),
  ],
});

const dragdrop = (cond?: string, cause?: string) => ({
  type: "dragdrop_rationale",
  blanks: [
    ...(cond ? [{ blankId: "cond", tokenId: cond }] : []),
    ...(cause ? [{ blankId: "cause", tokenId: cause }] : []),
  ],
});

describe("pairs distributions (rationale types)", () => {
  it("finds the most common wrong triads in a drop-down rationale room", () => {
    const item = itemSchema.parse(FIXTURES.dropdown_rationale.canonical);
    const responses = [
      dropdown("cond_a", "ev1_a", "ev2_a"),
      dropdown("cond_b", "ev1_b", "ev2_b"),
      dropdown("cond_b", "ev1_b", "ev2_b"),
      dropdown("cond_a", "ev1_b", "ev2_a"),
      dropdown("cond_b", "ev1_b"),
      dropdown(),
      "garbage",
    ];
    const result = distributionFor(item, responses);
    if (result.kind !== "pairs") throw new Error(`expected pairs, got ${result.kind}`);
    expect(result).toMatchObject({
      itemId: "ddr_sample_1",
      itemType: "dropdown_rationale",
      anchorBlankId: "cond",
      responded: 6,
      unreadable: 1,
      allCorrect: 1,
    });
    expect(result.blanks.map((blank) => blank.label)).toEqual(["Blank 1", "Blank 2", "Blank 3"]);
    expect(counts(result.blanks)).toEqual([
      [
        "cond",
        1,
        [
          ["cond_a", 2, true],
          ["cond_b", 3, false],
          ["cond_c", 0, false],
        ],
      ],
      [
        "ev_1",
        1,
        [
          ["ev1_a", 1, true],
          ["ev1_b", 4, false],
          ["ev1_c", 0, false],
        ],
      ],
      [
        "ev_2",
        2,
        [
          ["ev2_a", 2, true],
          ["ev2_b", 2, false],
          ["ev2_c", 0, false],
        ],
      ],
    ]);
    expect(combos(result.commonWrong)).toEqual([
      [2, "cond_b", "ev1_b", "ev2_b"],
      [1, "cond_a", "ev1_b", "ev2_a"],
      [1, "cond_b", "ev1_b", null],
    ]);
    expect(result.commonWrong[1]?.picks).toEqual([
      {
        blankId: "cond",
        choice: { id: "cond_a", label: "postpartum hemorrhage", correct: true },
      },
      {
        blankId: "ev_1",
        choice: { id: "ev1_b", label: "a temperature of 37.6 °C", correct: false },
      },
      {
        blankId: "ev_2",
        choice: { id: "ev2_a", label: "saturating a pad in 15 minutes", correct: true },
      },
    ]);
  });

  it("treats a single-use token placed in both blanks of a rationale as unreadable", () => {
    const item = itemSchema.parse(FIXTURES.dragdrop_rationale.canonical);
    if (item.type !== "dragdrop_rationale") throw new Error("expected dragdrop_rationale");
    expect(item.content.reusable).toBe(false);
    const result = distributionFor(item, [dragdrop("tok_atelectasis", "tok_atelectasis")]);
    expect(result).toMatchObject({ responded: 0, unreadable: 1 });
  });

  it("keeps the top wrong dyads of a drag-and-drop rationale room, ties in arrival order", () => {
    const item = itemSchema.parse(FIXTURES.dragdrop_rationale.canonical);
    const [atel, pe, shallow, immob] = [
      "tok_atelectasis",
      "tok_pe",
      "tok_shallow",
      "tok_immobility",
    ];
    const responses = [
      dragdrop(atel, shallow),
      dragdrop(atel, shallow),
      dragdrop(atel, immob),
      dragdrop(atel, immob),
      dragdrop(atel, immob),
      dragdrop(pe, immob),
      dragdrop(pe, immob),
      dragdrop(pe, shallow),
      dragdrop(immob, atel),
      dragdrop(shallow, atel),
      dragdrop(atel),
      dragdrop(),
    ];
    const result = distributionFor(item, responses);
    if (result.kind !== "pairs") throw new Error(`expected pairs, got ${result.kind}`);
    expect(result).toMatchObject({
      anchorBlankId: null,
      responded: 12,
      unreadable: 0,
      allCorrect: 2,
    });
    expect(counts(result.blanks)).toEqual([
      [
        "cond",
        1,
        [
          [atel, 6, true],
          [pe, 3, false],
          [shallow, 1, false],
          [immob, 1, false],
        ],
      ],
      [
        "cause",
        2,
        [
          [atel, 2, false],
          [pe, 0, false],
          [shallow, 3, true],
          [immob, 5, false],
        ],
      ],
    ]);
    expect(COMMON_WRONG_LIMIT).toBe(5);
    // Six wrong combinations; the sixth (atelectasis with the cause left empty) is cut.
    expect(combos(result.commonWrong)).toEqual([
      [3, atel, immob],
      [2, pe, immob],
      [1, pe, shallow],
      [1, immob, atel],
      [1, shallow, atel],
    ]);
  });
});
