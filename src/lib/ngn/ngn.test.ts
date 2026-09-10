import { describe, expect, it } from "vitest";
import { allFixtures, FIXTURES, sampleCaseStudy } from "./fixtures";
import { ITEM_TYPES, caseStudySchema, itemSchema, responseSchema, type Item } from "./schemas";
import { emptyResponse, maxPoints, scoreItem } from "./scoring";
import { ITEM_TYPE_LABELS, NGN_REGISTRY, SCORING_MODEL_LABELS } from "./registry";
import { ScoringError } from "./types";
import { validateCaseStudy, validateItem } from "./validate";

const parse = (input: unknown): Item => itemSchema.parse(input);

describe("fixtures parse and score", () => {
  it("covers every item type exactly once", () => {
    expect(allFixtures.map((f) => f.type).sort()).toEqual([...ITEM_TYPES].sort());
  });

  for (const fixture of allFixtures) {
    describe(fixture.type, () => {
      it("canonical and edge items validate", () => {
        expect(() => parse(fixture.canonical)).not.toThrow();
        expect(() => parse(fixture.edge)).not.toThrow();
      });

      it("declared maxPoints matches the scoring engine", () => {
        const item = parse(fixture.canonical);
        expect(maxPoints(item)).toBe(item.scoring.maxPoints);
        const edge = parse(fixture.edge);
        expect(maxPoints(edge)).toBe(edge.scoring.maxPoints);
      });

      for (const c of fixture.cases) {
        it(`scores "${c.name}" as ${c.expectedPoints}`, () => {
          const item = parse(fixture.canonical);
          const response = responseSchema.parse(c.response);
          const result = scoreItem(item, response);
          expect(result.points).toBe(c.expectedPoints);
          expect(result.points).toBeGreaterThanOrEqual(0);
          expect(result.points).toBeLessThanOrEqual(result.maxPoints);
          expect(result.model).toBe(item.scoring.model);
          for (const entry of result.breakdown) {
            expect(typeof entry.elementId).toBe("string");
            expect(typeof entry.correct).toBe("boolean");
          }
        });
      }
    });
  }
});

describe("scoreItem", () => {
  it("rejects a response of the wrong type", () => {
    const item = parse(FIXTURES.multiple_choice.canonical);
    expect(() => scoreItem(item, { type: "bowtie", actionIds: [], parameterIds: [] })).toThrow(
      ScoringError,
    );
  });

  it("does not mutate its inputs", () => {
    const item = parse(FIXTURES.multiple_response.canonical);
    const response = { type: "multiple_response" as const, optionIds: ["opt_a", "opt_c"] };
    const snapshot = JSON.stringify({ item, response });
    scoreItem(item, response);
    expect(JSON.stringify({ item, response })).toBe(snapshot);
  });

  it("produces an empty response for every type", () => {
    for (const fixture of allFixtures) {
      const item = parse(fixture.canonical);
      const empty = emptyResponse(item);
      expect(empty.type).toBe(item.type);
      expect(scoreItem(item, empty).points).toBe(0);
    }
  });

  it("ordered_response partial position scoring awards one point per correct slot", () => {
    const item = parse(FIXTURES.ordered_response.edge);
    const result = scoreItem(item, {
      type: "ordered_response",
      orderedIds: ["s1", "s3", "s2", "s4"],
    });
    expect(result).toMatchObject({ points: 2, maxPoints: 4 });
  });

  it("highlight_table without scorePerRow scores the whole item", () => {
    const item = parse(FIXTURES.highlight_table.edge);
    const result = scoreItem(item, { type: "highlight_table", spanIds: ["a", "b", "c", "d"] });
    expect(result).toMatchObject({ points: 2, maxPoints: 3 });
  });

  it("dragdrop_rationale triad uses the anchor", () => {
    const item = parse(FIXTURES.dragdrop_rationale.edge);
    const anchorWrong = scoreItem(item, {
      type: "dragdrop_rationale",
      blanks: [
        { blankId: "cond", tokenId: "t_fever" },
        { blankId: "ev1", tokenId: "t_calf" },
        { blankId: "ev2", tokenId: "t_immob" },
      ],
    });
    expect(anchorWrong.points).toBe(0);
  });
});

describe("schema validation errors", () => {
  const mc = FIXTURES.multiple_choice.canonical;

  it("rejects unknown types", () => {
    expect(validateItem({ ...mc, type: "essay" })).toMatchObject({ ok: false });
  });

  it("rejects a multiple choice key that is not an option", () => {
    const r = validateItem({ ...mc, answerKey: { correctOptionId: "nope" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/correctOptionId/);
  });

  it("rejects select_n with the wrong number of correct options", () => {
    const base = FIXTURES.multiple_response.edge;
    expect(validateItem({ ...base, answerKey: { correctOptionIds: ["opt_a"] } }).ok).toBe(false);
    expect(validateItem({ ...base, content: { ...base.content, n: undefined } }).ok).toBe(false);
  });

  it("rejects a matrix key that misses a row", () => {
    const base = FIXTURES.matrix_multiple_choice.edge;
    expect(
      validateItem({ ...base, answerKey: { rows: [{ rowId: "r1", correctColumnId: "improved" }] } })
        .ok,
    ).toBe(false);
  });

  it("rejects a triad rationale without an anchor", () => {
    const base = FIXTURES.dropdown_rationale.canonical;
    expect(
      validateItem({ ...base, answerKey: { ...base.answerKey, anchorBlankId: undefined } }).ok,
    ).toBe(false);
  });

  it("rejects cloze blanks that do not match the tokens", () => {
    const base = FIXTURES.dropdown_cloze.edge;
    const r = validateItem({
      ...base,
      content: {
        ...base.content,
        blanks: [...base.content.blanks, { id: "extra", choices: base.content.blanks[0].choices }],
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects drag-and-drop keys that are not in the bank", () => {
    const base = FIXTURES.dragdrop_cloze.canonical;
    expect(
      validateItem({
        ...base,
        answerKey: {
          blanks: [
            { blankId: "blank_1", correctTokenId: "ghost" },
            { blankId: "blank_2", correctTokenId: "tok_fowler" },
          ],
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects highlight keys that reference unknown spans", () => {
    const base = FIXTURES.highlight_text.canonical;
    expect(validateItem({ ...base, answerKey: { correctSpanIds: ["nope"] } }).ok).toBe(false);
  });

  it("rejects an ordered response key that is not a permutation", () => {
    const base = FIXTURES.ordered_response.canonical;
    expect(
      validateItem({
        ...base,
        answerKey: { orderedIds: ["act_help", "act_help", "act_aed", "act_rhythm", "act_shock"] },
      }).ok,
    ).toBe(false);
  });

  it("rejects bowtie keys with duplicate or unknown ids", () => {
    const base = FIXTURES.bowtie.canonical;
    expect(
      validateItem({ ...base, answerKey: { ...base.answerKey, actionIds: ["act_ecg", "act_ecg"] } })
        .ok,
    ).toBe(false);
    expect(
      validateItem({ ...base, answerKey: { ...base.answerKey, conditionId: "act_ecg" } }).ok,
    ).toBe(false);
  });

  it("rejects a grouping key with a foreign option", () => {
    const base = FIXTURES.multiple_response_grouping.edge;
    expect(
      validateItem({
        ...base,
        answerKey: {
          rows: [
            { rowId: "r1", correctOptionIds: ["r2_a"] },
            { rowId: "r2", correctOptionIds: ["r2_a"] },
          ],
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects a dropdown table key with a foreign choice", () => {
    const base = FIXTURES.dropdown_table.edge;
    expect(
      validateItem({
        ...base,
        answerKey: {
          rows: [
            { rowId: "r1", correctChoiceId: "r2_high" },
            { rowId: "r2", correctChoiceId: "r2_high" },
          ],
        },
      }).ok,
    ).toBe(false);
  });
});

describe("validateItem warnings", () => {
  it("returns no warnings for the canonical fixtures that carry rationale", () => {
    const r = validateItem(FIXTURES.multiple_choice.canonical);
    expect(r).toMatchObject({ ok: true, warnings: [] });
  });

  it("warns when rationale is missing", () => {
    const r = validateItem(FIXTURES.multiple_choice.edge);
    expect(r.ok && r.warnings.some((w) => w.includes("rationale"))).toBe(true);
  });

  it("warns when every SATA option is correct", () => {
    const base = FIXTURES.multiple_response.canonical;
    const r = validateItem({
      ...base,
      answerKey: { correctOptionIds: base.content.options.map((o) => o.id) },
    });
    expect(r.ok && r.warnings.some((w) => w.includes("SATA"))).toBe(true);
  });

  it("warns when most highlight spans are correct", () => {
    const base = FIXTURES.highlight_text.canonical;
    const r = validateItem({
      ...base,
      answerKey: { correctSpanIds: ["sp_hr", "sp_bp", "sp_sat", "sp_urine"] },
    });
    expect(r.ok && r.warnings.some((w) => w.includes("60%"))).toBe(true);
    const table = validateItem({
      ...FIXTURES.highlight_table.edge,
      answerKey: { correctSpanIds: ["a", "b", "c", "d"] },
    });
    expect(table.ok && table.warnings.some((w) => w.includes("60%"))).toBe(true);
  });
});

describe("case study", () => {
  it("sample case study validates with six items in CJMM order", () => {
    const r = validateCaseStudy(sampleCaseStudy);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.items.map((i) => i.cjmmStep)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(r.warnings).toEqual([]);
    }
  });

  it("rejects wrong item count and out-of-order steps", () => {
    const five = { ...sampleCaseStudy, items: sampleCaseStudy.items.slice(0, 5) };
    expect(validateCaseStudy(five).ok).toBe(false);
    const swapped = {
      ...sampleCaseStudy,
      items: [
        sampleCaseStudy.items[1],
        sampleCaseStudy.items[0],
        ...sampleCaseStudy.items.slice(2),
      ],
    };
    const r = validateCaseStudy(swapped);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/cjmmStep/);
  });

  it("surfaces item warnings with their index", () => {
    const [first, ...rest] = sampleCaseStudy.items;
    const noRationale = { ...sampleCaseStudy, items: [{ ...first, rationale: {} }, ...rest] };
    const r = validateCaseStudy(noRationale);
    expect(r.ok && r.warnings[0]).toMatch(/^items\.0:/);
    expect(caseStudySchema.safeParse(noRationale).success).toBe(true);
  });
});

describe("registry", () => {
  it("has a label, schema, scorer and fixture for every type", () => {
    for (const type of ITEM_TYPES) {
      expect(ITEM_TYPE_LABELS[type]).toBeTruthy();
      expect(NGN_REGISTRY[type].schema).toBeDefined();
      expect(typeof NGN_REGISTRY[type].score).toBe("function");
      expect(NGN_REGISTRY[type].fixture.type).toBe(type);
    }
    expect(Object.keys(SCORING_MODEL_LABELS)).toEqual(["zero_one", "plus_minus", "rationale"]);
  });
});
