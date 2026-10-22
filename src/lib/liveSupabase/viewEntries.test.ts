import { describe, expect, it } from "vitest";
import { CONFORMANCE_CORRECT, CONFORMANCE_ITEMS } from "@/lib/live/roomConformance";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { startingOrderSeed } from "@/lib/ngn/startingOrder";
import { toItemRow } from "@/lib/supabase/itemRows";
import type { CaseStudyRun } from "@/lib/live/caseStudyRuns";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import { roomRecord, stepRecord, viewEntries, type ViewEntriesInput } from "./viewEntries";

/**
 * `viewEntries` is the only door between rows that carry keys and a response (#407, ADR 0003), so
 * it is tested on its own with rows worse than the database hands it: answer rows that carry
 * marks and a scored key **before** the reveal. The SQL function and the fallback's selects do
 * not read those columns until the host has revealed, but this function must not depend on that.
 */

const SESSION = "00000000-0000-0000-0000-000000000407";
const [FIRST, SECOND] = CONFORMANCE_ITEMS as [Item, Item, Item];

const rowOf = (item: Item, id: string) => ({ id, ...toItemRow(item) });

/** Every string only this item's key, rationale or scoring would put in a body. */
function secretsOf(item: Item): string[] {
  const whole = [item.answerKey, item.rationale, item.scoring].map((part) => JSON.stringify(part));
  const texts = [
    item.rationale.general?.value,
    ...Object.values(item.rationale.perElement ?? {}).map((text) => text.value),
  ].filter((text): text is string => typeof text === "string" && text !== "");
  return [...whole.filter((part) => part !== "{}"), ...texts.map((text) => JSON.stringify(text))];
}

/** A marked answer, as a row reads after the reveal: with its points and the key it was scored with. */
const markedAnswer = (item: Item, position: number) => ({
  item_position: position,
  response: CONFORMANCE_CORRECT,
  submitted_at: "2027-01-15T08:00:00.000+00:00",
  points: 1,
  max_points: 1,
  model: "zero_one",
  breakdown: [{ elementId: "leaked_breakdown", correct: true }],
  groups: [{ id: "leaked_group" }],
  reveal: { answerKey: item.answerKey, rationale: item.rationale, scoring: item.scoring },
});

function input(over: Partial<ViewEntriesInput>): ViewEntriesInput {
  return {
    sessionId: SESSION,
    wanted: [{ id: "row-1", position: 1 }],
    items: [rowOf(FIRST, "row-1")],
    answers: [],
    reveal: false,
    startingOrderSeed,
    ...over,
  };
}

describe("viewEntries before the reveal (ADR 0003)", () => {
  it("passes on no key, rationale, scoring or mark, even from rows that carry them", () => {
    const built = viewEntries(input({ answers: [markedAnswer(FIRST, 1)] }));
    if (!built.ok) throw new Error("the view was refused");
    const bytes = JSON.stringify(built.entries);

    // Not empty: the item and the participant's own answer are there.
    expect(bytes).toContain(FIRST.id);
    expect(bytes).toContain(JSON.stringify(CONFORMANCE_CORRECT));
    expect(built.entries[0]?.revealed).toBeNull();

    for (const secret of secretsOf(FIRST)) expect(bytes).not.toContain(secret);
    for (const name of [
      "answerKey",
      "answer_key",
      "rationale",
      "scoring",
      "points",
      "max_points",
    ]) {
      expect(bytes).not.toContain(`"${name}"`);
    }
    expect(bytes).not.toContain("leaked_breakdown");
    expect(bytes).not.toContain("leaked_group");
  });

  it("has a control: the same rows after the reveal do carry them", () => {
    const built = viewEntries(input({ answers: [markedAnswer(FIRST, 1)], reveal: true }));
    if (!built.ok) throw new Error("the view was refused");
    const bytes = JSON.stringify(built.entries);
    for (const secret of secretsOf(FIRST)) expect(bytes).toContain(secret);
    expect(bytes).toContain("leaked_breakdown");
    expect(bytes).toContain('"points"');
  });

  it("holds for one of every item type", () => {
    for (const fixture of Object.values(FIXTURES)) {
      const item = itemSchema.parse(fixture.canonical);
      const secrets = secretsOf(item);
      expect(secrets.length).toBeGreaterThan(0);

      const rows = input({ items: [rowOf(item, "row-1")] });
      const before = viewEntries(rows);
      const after = viewEntries({ ...rows, reveal: true });
      if (!before.ok || !after.ok) throw new Error(`${item.type} was refused`);

      const hidden = JSON.stringify(before.entries);
      const shown = JSON.stringify(after.entries);
      expect(hidden).toContain(item.id);
      expect(hidden).not.toContain('"answerKey"');
      // The key whole is the check that cannot be fooled by a renamed field. It is in the reveal.
      expect(hidden).not.toContain(JSON.stringify(item.answerKey));
      expect(shown).toContain(JSON.stringify(item.answerKey));
    }
  });

  it("shows only the items asked for, whatever else the rows hold", () => {
    const built = viewEntries(input({ items: [rowOf(FIRST, "row-1"), rowOf(SECOND, "row-2")] }));
    if (!built.ok) throw new Error("the view was refused");
    const bytes = JSON.stringify(built.entries);
    expect(built.entries).toHaveLength(1);
    expect(bytes).not.toContain(SECOND.id);
  });
});

describe("viewEntries with rows it cannot use", () => {
  it("refuses a room whose item is not among the rows", () => {
    expect(viewEntries(input({ items: [] }))).toEqual({ ok: false, reason: "unplayable" });
  });

  it("refuses rows that are not items, rather than showing what it can", () => {
    for (const bad of [null, "row", [], { type: "multiple_choice" }, { id: "row-1" }]) {
      expect(viewEntries(input({ items: [bad] }))).toEqual({ ok: false, reason: "unplayable" });
    }
  });

  it("shows the same item twice when the set names it twice", () => {
    const built = viewEntries(
      input({
        wanted: [
          { id: "row-1", position: 1 },
          { id: "row-1", position: 2 },
        ],
        answers: [markedAnswer(FIRST, 2)],
      }),
    );
    if (!built.ok) throw new Error("the view was refused");
    expect(built.entries.map((entry) => entry.position)).toEqual([1, 2]);
    // The answer is to the second place, and is not read back as an answer to the first.
    expect(built.entries.map((entry) => entry.answered !== null)).toEqual([false, true]);
  });

  it("reads an answer that is not a row, or has no time, as not answered", () => {
    for (const answers of [[null], ["x"], [{ item_position: 1, response: CONFORMANCE_CORRECT }]]) {
      const built = viewEntries(input({ answers }));
      if (!built.ok) throw new Error("the view was refused");
      expect(built.entries[0]?.answered).toBeNull();
    }
  });
});

describe("the charts of a quiz that plays case studies in place (#469)", () => {
  const staged = ehrRecordSchema.parse(stagedEhr);
  // Position 1 a loose question; 2 to 7 a case study with the staged record; 8 to 13 one without.
  const runs: CaseStudyRun[] = [
    { caseStudyId: "case-a", title: "A", firstPosition: 2, stepCount: 6, record: staged },
    { caseStudyId: "case-b", title: "B", firstPosition: 8, stepCount: 6, record: null },
  ];

  it("cuts a step's chart to its own step, counted from its case study's first position", () => {
    expect(stepRecord(runs, 2)).toEqual(recordAtStep(staged, 1));
    expect(stepRecord(runs, 4)).toEqual(recordAtStep(staged, 3));
    expect(stepRecord(runs, 7)).toEqual(recordAtStep(staged, 6));
  });

  it("has no chart on a loose question, nor for a case study that had no record", () => {
    expect(stepRecord(runs, 1)).toBeUndefined();
    expect(stepRecord(runs, 9)).toBeUndefined();
    expect(stepRecord(runs, null)).toBeUndefined();
  });

  it("tells the phone to put the chart away anywhere but a step with a chart", () => {
    expect(roomRecord(null, 3, runs)).toEqual(recordAtStep(staged, 2));
    expect(roomRecord(null, 1, runs)).toBeNull();
    expect(roomRecord(null, null, runs)).toBeNull();
    expect(roomRecord(null, 9, runs)).toBeNull();
    // A room run from one case study, or from a quiz of loose questions, is as it was.
    expect(roomRecord(staged, null)).toEqual(recordAtStep(staged, 1));
    expect(roomRecord(null, 2)).toBeUndefined();
  });

  it("hands each step of a student-paced set its chart, and a loose question none", () => {
    const built = viewEntries(
      input({
        wanted: [
          { id: "row-1", position: 1 },
          { id: "row-2", position: 4 },
        ],
        items: [rowOf(FIRST, "row-1"), rowOf(SECOND, "row-2")],
        answers: [markedAnswer(SECOND, 4)],
        runs,
      }),
    );
    if (!built.ok) throw new Error("the view was refused");
    const [loose, step] = built.entries;
    expect(loose).not.toHaveProperty("record");
    expect(step?.record).toEqual(recordAtStep(staged, 3));
    // The chart is a step's view, and the entry is still keyless before the reveal.
    const bytes = JSON.stringify(built.entries);
    expect(bytes).not.toContain("fromStep");
    expect(bytes).not.toContain("stepAccess");
    for (const secret of [...secretsOf(FIRST), ...secretsOf(SECOND)]) {
      expect(bytes).not.toContain(secret);
    }
  });
});
