import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { distributionFor } from "./index";

const ordered = itemSchema.parse(FIXTURES.ordered_response.canonical);
const KEY = ["act_help", "act_cpr", "act_aed", "act_rhythm", "act_shock"];

describe("order distribution", () => {
  it("counts which item each respondent put in each position", () => {
    const responses = [
      { type: "ordered_response", orderedIds: KEY },
      {
        type: "ordered_response",
        orderedIds: ["act_cpr", "act_help", "act_aed", "act_rhythm", "act_shock"],
      },
      { type: "ordered_response", orderedIds: ["act_help", "act_cpr"] },
      { type: "ordered_response", orderedIds: [] },
      { type: "ordered_response", orderedIds: ["act_help", "act_help"] },
    ];
    const result = distributionFor(ordered, responses);
    if (result.kind !== "order") throw new Error(`expected order, got ${result.kind}`);
    expect(result).toMatchObject({
      itemId: "or_sample_1",
      itemType: "ordered_response",
      responded: 4,
      unreadable: 1,
      exact: 1,
    });
    expect(result.positions[0]?.choices[0]).toEqual({
      id: "act_help",
      label: "Call for help and activate the emergency response",
      count: 2,
      correct: true,
    });
    // Per position: [unanswered, counts in item order, the id the key puts there].
    expect(
      result.positions.map((p) => [
        p.position,
        p.unanswered,
        p.choices.map((c) => c.count),
        p.choices.filter((c) => c.correct).map((c) => c.id),
      ]),
    ).toEqual([
      [1, 1, [2, 1, 0, 0, 0], ["act_help"]],
      [2, 1, [1, 2, 0, 0, 0], ["act_cpr"]],
      [3, 2, [0, 0, 2, 0, 0], ["act_aed"]],
      [4, 2, [0, 0, 0, 2, 0], ["act_rhythm"]],
      [5, 2, [0, 0, 0, 0, 2], ["act_shock"]],
    ]);
  });
});
