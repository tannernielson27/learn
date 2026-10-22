import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { caseStudySchema, ehrRecordSchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";
import { shuffleItem, shuffleSeed } from "@/lib/ngn/shuffle";
import { withStartingOrder, startingOrderSeed } from "@/lib/ngn/startingOrder";
import { toKeylessItem } from "@/lib/ngn/submit";
import { secretStartingOrderSeed } from "@/lib/supabase/startingOrderSeed";
import { buildPracticeView, type PracticeViewInput } from "./view";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const ORDERED = itemSchema.parse(FIXTURES.ordered_response.canonical) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);
const STEPS = CASE.items;

const rowId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CASE_ID = "00000000-0000-4000-8000-00000000c001";
const RUN = {
  runId: "00000000-0000-4000-8000-00000000a001",
  bankId: "00000000-0000-4000-8000-00000000b001",
  bankName: "Cardiac week",
  seed: "5d0c6a3e-0f6b-4d7e-9b1a-2f3c4d5e6f70",
};

/** The strings only a key, a rationale or a scoring rule would put in a payload. */
function secretsOf(item: Item): string[] {
  const secrets = [JSON.stringify(item.answerKey), JSON.stringify(item.scoring)];
  if (item.rationale.general) secrets.push(item.rationale.general.value);
  for (const text of Object.values(item.rationale.perElement ?? {})) secrets.push(text.value);
  return secrets;
}

/**
 * Only the strings that name one item's answer. A scoring rule such as
 * {"model":"zero_one","maxPoints":1} is shared by many items, so it cannot tell one reveal from
 * another.
 */
const keyAndRationaleOf = (item: Item): string[] =>
  secretsOf(item).filter((secret) => secret !== JSON.stringify(item.scoring));

function input(overrides: Partial<PracticeViewInput> = {}): PracticeViewInput {
  const standalone = [MC, MR];
  return {
    run: RUN,
    slots: [
      ...standalone.map((_, i) => ({ itemId: rowId(i + 1), caseStudyId: null, step: null })),
      ...STEPS.map((_, i) => ({ itemId: rowId(100 + i), caseStudyId: CASE_ID, step: i + 1 })),
    ],
    items: [
      ...standalone.map((item, i) => ({ rowId: rowId(i + 1), item })),
      ...STEPS.map((item, i) => ({ rowId: rowId(100 + i), item })),
    ],
    caseStudies: [{ id: CASE_ID, title: CASE.title, ehr: CASE.ehr }],
    answers: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildPracticeView, on the bytes a student is handed", () => {
  it("carries every item and the first step with no key, rationale or scoring before anything is answered", () => {
    const source = input();
    // The control: what the builder is given does carry every secret.
    const given = JSON.stringify(source);
    for (const item of [MC, MR, ...STEPS])
      for (const secret of secretsOf(item)) expect(given).toContain(secret);

    const bytes = JSON.stringify(buildPracticeView(source));
    for (const item of [MC, MR, ...STEPS]) {
      for (const secret of secretsOf(item)) expect(bytes).not.toContain(secret);
    }
    // #335: the steps not yet reached are not sent at all.
    for (const item of [MC, MR, STEPS[0] as Item]) expect(bytes).toContain(item.id);
    for (const item of STEPS.slice(1)) expect(bytes).not.toContain(`"id":"${item.id}"`);
    for (const field of ['"answerKey"', '"rationale"', '"scoring"', '"points"', RUN.seed]) {
      expect(bytes).not.toContain(field);
    }
  });

  it("carries the key and marks of an answered item, and still none for the rest", () => {
    const answered = FIXTURES.multiple_choice.canonical.answerKey;
    const view = buildPracticeView(
      input({
        answers: {
          [rowId(1)]: { type: "multiple_choice", optionId: answered.correctOptionId },
        },
      }),
    );
    const bytes = JSON.stringify(view);
    for (const secret of secretsOf(MC)) expect(bytes).toContain(secret);
    for (const item of [MR, ...STEPS])
      for (const secret of keyAndRationaleOf(item)) expect(bytes).not.toContain(secret);
    expect(bytes.match(/"answerKey"/g)).toHaveLength(1);

    const first = view.entries[0];
    expect(first?.kind).toBe("item");
    if (first?.kind !== "item") return;
    expect(first.answered?.kind).toBe("scored");
    if (first.answered?.kind !== "scored") return;
    expect(first.answered.reveal.score.points).toBe(first.answered.reveal.score.maxPoints);
    expect(view.answered).toBe(1);
  });

  it("carries one answered case-study step's key and not its neighbours'", () => {
    const stepOne = STEPS[0] as Item;
    const view = buildPracticeView(input({ answers: { [rowId(100)]: { type: stepOne.type } } }));
    const bytes = JSON.stringify(view);
    for (const secret of secretsOf(stepOne)) expect(bytes).toContain(secret);
    for (const step of STEPS.slice(1))
      for (const secret of keyAndRationaleOf(step)) expect(bytes).not.toContain(secret);
    expect(bytes.match(/"answerKey"/g)).toHaveLength(1);
  });

  it("groups a case study's reached steps under it, in step order, with each one's record", () => {
    const answers = { [rowId(100)]: { type: "bowtie" }, [rowId(101)]: { type: "bowtie" } };
    const view = buildPracticeView(input({ answers }));
    expect(view.entries.map((entry) => entry.kind)).toEqual(["item", "item", "case_study"]);
    const study = view.entries[2];
    if (study?.kind !== "case_study") throw new Error("expected a case study");
    expect(study.title).toBe(CASE.title);
    // A record with neither field reads the same at every step.
    expect(study.records).toEqual([CASE.ehr, CASE.ehr, CASE.ehr]);
    expect(study.steps.map((step) => step.itemId)).toEqual([0, 1, 2].map((i) => rowId(100 + i)));
    expect(study.stepCount).toBe(STEPS.length);
    expect(view.total).toBe(2 + STEPS.length);
    expect(view.answered).toBe(2);
  });

  it("counts every step toward the total before any is reached", () => {
    const view = buildPracticeView(input());
    expect(view.total).toBe(2 + STEPS.length);
    expect(view.answered).toBe(0);
    expect(view.runId).toBe(RUN.runId);
    expect(view.bankName).toBe(RUN.bankName);
  });

  it("shuffles options by the run's seed, which differs per run", () => {
    const view = buildPracticeView(input());
    const first = view.entries[0];
    if (first?.kind !== "item") throw new Error("expected an item");
    const expected = shuffleItem(
      toKeylessItem(MC, secretStartingOrderSeed(RUN.seed, MC.id)),
      shuffleSeed(RUN.seed, MC.id),
    );
    expect(first.item).toEqual(expected);
  });

  it("starts an ordered response in the order keyed by the server secret, never the public seed", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_for_this_test_only");
    const view = buildPracticeView(
      input({
        slots: [{ itemId: rowId(1), caseStudyId: null, step: null }],
        items: [{ rowId: rowId(1), item: ORDERED }],
        caseStudies: [],
      }),
    );
    const first = view.entries[0];
    if (first?.kind !== "item") throw new Error("expected an item");
    const secret = secretStartingOrderSeed(RUN.seed, ORDERED.id);
    expect(secret).not.toBe(startingOrderSeed(RUN.seed, ORDERED.id));
    const keyed = withStartingOrder(ORDERED, secret);
    if (first.item.type !== "ordered_response" || keyed.type !== "ordered_response") {
      throw new Error("expected ordered response");
    }
    // Options within each step may be shuffled; the steps' starting order is the secret one.
    expect(first.item.content.items.map((step) => step.id)).toEqual(
      keyed.content.items.map((step) => step.id),
    );
  });

  it("opens a stored answer that no longer parses on the key alone, with no marks", () => {
    const view = buildPracticeView(input({ answers: { [rowId(2)]: { type: "bowtie" } } }));
    const second = view.entries[1];
    if (second?.kind !== "item") throw new Error("expected an item");
    expect(second.answered?.kind).toBe("key");
    expect(JSON.stringify(second)).not.toContain('"score"');
    expect(view.answered).toBe(1);
  });

  it("leaves out an item that could not be read and a case study whose record is broken", () => {
    const view = buildPracticeView(
      input({
        items: [
          { rowId: rowId(2), item: MR },
          ...STEPS.map((item, i) => ({ rowId: rowId(100 + i), item })),
        ],
        caseStudies: [{ id: CASE_ID, title: CASE.title, ehr: { broken: true } }],
      }),
    );
    expect(view.entries).toHaveLength(1);
    expect(view.total).toBe(1);
  });

  describe("a chart that grows with the case (#335)", () => {
    const staged = { id: CASE_ID, title: CASE.title, ehr: stagedEhr };
    const NOTE_0200 = "0200: Second large-bore IV";
    const LABS = "Serum hCG";
    /** The run with the first `count` steps answered. */
    const after = (count: number) =>
      JSON.stringify(
        buildPracticeView(
          input({
            caseStudies: [staged],
            answers: Object.fromEntries(
              STEPS.slice(0, count).map((step, i) => [rowId(100 + i), { type: step.type }]),
            ),
          }),
        ),
      );

    it("sends step 1's chart and nothing a later step reveals", () => {
      const bytes = after(0);
      expect(bytes).toContain("0115: Pain now 8/10");
      for (const later of [
        NOTE_0200,
        "0130: Pale",
        LABS,
        "Lab Results",
        "fromStep",
        "stepAccess",
      ]) {
        expect(bytes).not.toContain(later);
      }
    });

    it("names a tab locked at a reached step and sends none of its text", () => {
      const bytes = after(1);
      expect(bytes).toContain('"title":"Lab Results","locked":true');
      expect(bytes).not.toContain(LABS);
    });

    it("sends each part at the step that reveals it, and keeps the earlier steps' charts", () => {
      // The controls: step 3 opens the labs, step 4 brings the 0200 note.
      expect(after(2)).toContain(LABS);
      expect(after(2)).not.toContain(NOTE_0200);
      const reached4 = buildPracticeView(
        input({
          caseStudies: [staged],
          answers: Object.fromEntries(
            STEPS.slice(0, 3).map((step, i) => [rowId(100 + i), { type: step.type }]),
          ),
        }),
      );
      const study = reached4.entries[2];
      if (study?.kind !== "case_study") throw new Error("expected a case study");
      const record = ehrRecordSchema.parse(stagedEhr);
      expect(study.records).toEqual(
        [1, 2, 3, 4].map((step) => recordAtStep(record, step as CjmmStep)),
      );
      expect(JSON.stringify(study.records[3])).toContain(NOTE_0200);
    });

    it("reaches nothing with an answer past a gap", () => {
      const view = buildPracticeView(
        input({ caseStudies: [staged], answers: { [rowId(103)]: { type: STEPS[3]!.type } } }),
      );
      const study = view.entries[2];
      if (study?.kind !== "case_study") throw new Error("expected a case study");
      expect(study.steps).toHaveLength(1);
      expect(JSON.stringify(view)).not.toContain(NOTE_0200);
    });
  });

  describe("a run of only the missed questions (20261023020000)", () => {
    const missedSlots = [
      { itemId: rowId(1), caseStudyId: null, step: null },
      { itemId: rowId(102), caseStudyId: CASE_ID, step: 3 },
      { itemId: rowId(104), caseStudyId: CASE_ID, step: 5 },
    ];

    it("plays each missed step on its own, with the chart at its own step and a line naming it", () => {
      const view = buildPracticeView(
        input({
          slots: missedSlots,
          caseStudies: [{ id: CASE_ID, title: "Hip", ehr: stagedEhr }],
          missed: true,
        }),
      );
      expect(view.kind).toBe("missed");
      expect(view.total).toBe(3);
      expect(view.entries.map((entry) => entry.kind)).toEqual(["item", "item", "item"]);
      const [, third, fifth] = view.entries;
      if (third?.kind !== "item" || fifth?.kind !== "item") throw new Error("expected items");
      expect(third.record).toEqual(recordAtStep(stagedEhr, 3));
      expect(fifth.record).toEqual(recordAtStep(stagedEhr, 5));
      expect(third.context).toBe("Case study: Hip · Step 3: Prioritize Hypotheses");
      expect(view.entries[0]).not.toHaveProperty("record");
    });

    it("plays a step whose record is broken without one rather than dropping it", () => {
      const view = buildPracticeView(
        input({
          slots: missedSlots,
          caseStudies: [{ id: CASE_ID, title: "Hip", ehr: { broken: true } }],
          missed: true,
        }),
      );
      expect(view.entries).toHaveLength(3);
      expect(view.entries[1]).not.toHaveProperty("record");
    });

    it("is a quiz run unless it says otherwise", () => {
      expect(buildPracticeView(input()).kind).toBe("quiz");
    });
  });

  it("changes nothing it is given", () => {
    const source = input({ answers: { [rowId(1)]: { type: "multiple_choice", optionId: "x" } } });
    const before = JSON.stringify(source);
    buildPracticeView(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
