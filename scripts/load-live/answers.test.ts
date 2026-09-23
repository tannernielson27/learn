import { describe, expect, it } from "vitest";
import { allFixtures } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { parseSubmission, scoreSubmission, toKeylessItem } from "@/lib/ngn/submit";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { createRng, randomResponse } from "./answers.mjs";

// #187: the load script answers items it only ever sees without their keys, the way a phone does.
// Every answer it makes up has to be one the submit route accepts — a malformed answer would be
// counted as a refusal the room never really had — and across a crowd the marks have to spread.

const items: Item[] = allFixtures.flatMap((fixture) =>
  [fixture.canonical, fixture.edge].map((input) => itemSchema.parse(input) as Item),
);

describe("randomResponse", () => {
  it("covers every item type", () => {
    expect(new Set(items.map((item) => item.type))).toEqual(new Set(ITEM_TYPES));
  });

  it.each(items.map((item) => [`${item.type} ${item.id}`, item] as const))(
    "makes answers the submit route accepts for %s, from the keyless item alone",
    (_name, item) => {
      const keyless = toKeylessItem(item);
      const rng = createRng(7);
      for (let run = 0; run < 40; run += 1) {
        const response = randomResponse(keyless, rng);
        const parsed = parseSubmission({ response }, item.type);
        expect(parsed.ok, JSON.stringify(response)).toBe(true);
        if (parsed.ok) expect(() => scoreSubmission(item, parsed.response)).not.toThrow();
      }
    },
  );

  it("spreads a crowd across full, partial and no marks", () => {
    const rng = createRng(11);
    const outcomes = { full: 0, partial: 0, none: 0 };
    for (const item of items) {
      const keyless = toKeylessItem(item);
      for (let run = 0; run < 60; run += 1) {
        const parsed = parseSubmission({ response: randomResponse(keyless, rng) }, item.type);
        if (!parsed.ok) throw new Error("unparseable");
        const { points, maxPoints } = scoreSubmission(item, parsed.response).score;
        if (points >= maxPoints) outcomes.full += 1;
        else if (points > 0) outcomes.partial += 1;
        else outcomes.none += 1;
      }
    }
    expect(outcomes.full).toBeGreaterThan(0);
    expect(outcomes.partial).toBeGreaterThan(0);
    expect(outcomes.none).toBeGreaterThan(0);
  });

  it("never reads the key, even when it is handed one", () => {
    const item = items.find((candidate) => candidate.type === "multiple_choice")!;
    const guarded = new Proxy(item, {
      get(target, property, receiver) {
        if (property === "answerKey" || property === "rationale" || property === "scoring") {
          throw new Error(`read ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(() => randomResponse(guarded, createRng(1))).not.toThrow();
  });

  it("does not change the item it is given", () => {
    const keyless = toKeylessItem(items[0]);
    const before = JSON.stringify(keyless);
    randomResponse(keyless, createRng(3));
    expect(JSON.stringify(keyless)).toBe(before);
  });

  it("refuses an item type it does not know", () => {
    expect(() => randomResponse({ type: "essay", content: {} }, createRng(1))).toThrow(/essay/);
  });
});

describe("createRng", () => {
  it("is repeatable for a seed and stays in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    const draws = Array.from({ length: 100 }, () => a());
    expect(draws).toEqual(Array.from({ length: 100 }, () => b()));
    expect(draws.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(new Set(draws).size).toBeGreaterThan(90);
  });
});
