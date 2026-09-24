import { describe, expect, it } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import type { SetItem } from "./attemptScoring";
import { buildAttemptSet } from "./attemptView";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const STEPS = caseStudySchema.parse(sampleCaseStudy).items;

const rowId = (index: number) => `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
const setOf = (items: readonly Item[]): SetItem[] =>
  items.map((item, index) => ({ rowId: rowId(index + 1), item }));

const ATTEMPT_A = "3f1c1f0e-8f5e-4c43-9a55-6c3f1b2a0a01";
const ATTEMPT_B = "3f1c1f0e-8f5e-4c43-9a55-6c3f1b2a0a02";

/** The strings only a key, a rationale or a scoring rule would put in the payload. */
function secretsOf(item: Item): string[] {
  const secrets = [JSON.stringify(item.answerKey), JSON.stringify(item.scoring)];
  if (item.rationale.general) secrets.push(item.rationale.general.value);
  for (const text of Object.values(item.rationale.perElement ?? {})) secrets.push(text.value);
  return secrets;
}

describe("buildAttemptSet, on the bytes a student is handed", () => {
  it("carries every item of a bank and no key, rationale or scoring for any of them", () => {
    const set = setOf([MC, MR]);
    // The control: the same items, before the payload is built, do carry every secret.
    const source = JSON.stringify(set);
    for (const item of [MC, MR])
      for (const secret of secretsOf(item)) expect(source).toContain(secret);

    const bytes = JSON.stringify(
      buildAttemptSet({ set, attemptId: ATTEMPT_A, shuffle: true, answers: {} }),
    );
    expect(bytes).toContain(MC.id);
    expect(bytes).toContain(MR.id);
    for (const item of [MC, MR]) {
      for (const secret of secretsOf(item)) expect(bytes).not.toContain(secret);
    }
    expect(bytes).not.toContain('"answerKey"');
    expect(bytes).not.toContain('"rationale"');
    expect(bytes).not.toContain('"scoring"');
    expect(bytes).not.toContain('"points"');
  });

  it("carries all six steps of a case study and none of their keys", () => {
    const set = setOf(STEPS);
    const source = JSON.stringify(set);
    expect(source).toContain('"answerKey"');
    expect(source).toContain('"rationale"');

    const bytes = JSON.stringify(
      buildAttemptSet({ set, attemptId: ATTEMPT_A, shuffle: false, answers: {} }),
    );
    for (const step of STEPS) {
      expect(bytes).toContain(step.id);
      for (const secret of secretsOf(step)) expect(bytes).not.toContain(secret);
    }
    expect(bytes).not.toContain('"answerKey"');
    expect(bytes).not.toContain('"rationale"');
  });

  it("hands back this attempt's own saved answer, and a blank one where it no longer parses", () => {
    const payload = buildAttemptSet({
      set: setOf([MC, MR]),
      attemptId: ATTEMPT_A,
      shuffle: false,
      answers: {
        [rowId(1)]: { type: "multiple_choice", optionId: "opt_c" },
        [rowId(2)]: { type: "multiple_choice", optionId: "opt_c" },
      },
    });
    expect(payload.map((entry) => entry.position)).toEqual([1, 2]);
    expect(payload.map((entry) => entry.itemId)).toEqual([rowId(1), rowId(2)]);
    expect(payload[0]?.saved).toEqual({ type: "multiple_choice", optionId: "opt_c" });
    expect(payload[1]?.saved).toBeNull();
  });
});

describe("the shuffle (#209)", () => {
  const optionOrder = (attemptId: string, shuffle = true) => {
    const [entry] = buildAttemptSet({ set: setOf([MR]), attemptId, shuffle, answers: {} });
    const content = entry?.item.content as { options: { id: string }[] };
    return content.options.map((option) => option.id);
  };
  const authored = (MR.content as { options: { id: string }[] }).options.map((option) => option.id);

  it("keeps the author's order when the assignment does not shuffle", () => {
    expect(optionOrder(ATTEMPT_A, false)).toEqual(authored);
  });

  it("gives one attempt the same order on every build, as a resume on another device needs", () => {
    expect(optionOrder(ATTEMPT_A)).toEqual(optionOrder(ATTEMPT_A));
    expect([...optionOrder(ATTEMPT_A)].sort()).toEqual([...authored].sort());
  });

  it("gives different attempts different orders", () => {
    const orders = new Set(
      Array.from({ length: 8 }, (_, index) =>
        optionOrder(`3f1c1f0e-8f5e-4c43-9a55-6c3f1b2a0b${String(index).padStart(2, "0")}`).join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
    expect(optionOrder(ATTEMPT_A)).not.toEqual(optionOrder(ATTEMPT_B));
  });

  it("does not change the items it is given", () => {
    const set = setOf([MC, MR]);
    const before = JSON.stringify(set);
    buildAttemptSet({ set, attemptId: ATTEMPT_A, shuffle: true, answers: {} });
    expect(JSON.stringify(set)).toBe(before);
  });
});

describe("an ordered-response item's starting order, on the bytes (#219)", () => {
  const OR = itemSchema.parse(FIXTURES.ordered_response.canonical) as Item;
  const key = (OR.answerKey as { orderedIds: string[] }).orderedIds;
  /** The steps in the order the bytes list them, read off the `"id":"…"` of each. */
  const stepOrder = (bytes: string) =>
    [...key].sort((a, b) => bytes.indexOf(`"id":"${a}"`) - bytes.indexOf(`"id":"${b}"`));
  const attempt = (n: number, block = "c") =>
    `3f1c1f0e-8f5e-4c43-9a55-6c3f1b2a0${block}${String(n).padStart(2, "0")}`;

  it("never sends the steps in the key's order, shuffled assignment or not", () => {
    // The control: the item as stored lists its steps in the key's order, and the reader sees it.
    expect(stepOrder(JSON.stringify(setOf([OR])))).toEqual(key);
    for (const shuffle of [true, false]) {
      for (let s = 0; s < 40; s += 1) {
        const bytes = JSON.stringify(
          buildAttemptSet({ set: setOf([OR]), attemptId: attempt(s), shuffle, answers: {} }),
        );
        for (const id of key) expect(bytes).toContain(`"id":"${id}"`);
        expect(stepOrder(bytes)).not.toEqual(key);
        expect(bytes).not.toContain(JSON.stringify(key));
      }
    }
  });

  it("seeds the order by attempt, so a resume sees it again and two students may not", () => {
    const orderFor = (attemptId: string) =>
      stepOrder(
        JSON.stringify(
          buildAttemptSet({ set: setOf([OR]), attemptId, shuffle: false, answers: {} }),
        ),
      ).join();
    expect(orderFor(ATTEMPT_A)).toBe(orderFor(ATTEMPT_A));
    const orders = new Set(Array.from({ length: 12 }, (_, s) => orderFor(attempt(s, "d"))));
    expect(orders.size).toBeGreaterThan(1);
  });
});
