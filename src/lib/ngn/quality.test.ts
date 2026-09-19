import { describe, expect, it } from "vitest";
import { FIXTURES, sampleCaseStudy } from "./fixtures";
import { itemQualityWarnings, publishBlockers, stemAsksSomething } from "./quality";
import { itemSchema, type Item } from "./schemas";

const parse = (input: unknown): Item => itemSchema.parse(input);
const codes = (item: Item) => itemQualityWarnings(item).map((warning) => warning.code);

/** A per-element rationale map without the named options' entries. */
const without = <T>(record: Record<string, T> | undefined, ...ids: string[]) =>
  Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => !ids.includes(id)));

describe("itemQualityWarnings", () => {
  it("finds nothing wrong with the canonical fixtures", () => {
    for (const type of Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]) {
      expect(itemQualityWarnings(parse(FIXTURES[type].canonical))).toEqual([]);
    }
  });

  it("points a missing rationale at rationale.general", () => {
    const item = parse({ ...FIXTURES.multiple_choice.canonical, rationale: {} });
    expect(itemQualityWarnings(item)).toEqual([
      {
        code: "rationale_missing",
        path: ["rationale", "general"],
        message: "Write a rationale. An item needs one before it can be published.",
      },
    ]);
  });

  it("warns when every SATA option is marked correct", () => {
    const base = FIXTURES.multiple_response.canonical;
    const item = parse({
      ...base,
      answerKey: { correctOptionIds: base.content.options.map((option) => option.id) },
    });
    const warning = itemQualityWarnings(item).find((w) => w.code === "sata_all_correct");
    expect(warning).toMatchObject({ path: ["answerKey", "correctOptionIds"] });
    expect(warning?.message).toMatch(/every option/i);
  });

  it("warns when SATA options have no explanation, naming them and pointing at the first", () => {
    const base = FIXTURES.multiple_response.canonical;
    const rest = without(base.rationale?.perElement, "opt_b", "opt_d");
    const item = parse({ ...base, rationale: { ...base.rationale, perElement: rest } });
    const warning = itemQualityWarnings(item).find(
      (w) => w.code === "sata_option_rationale_missing",
    );
    expect(warning).toEqual({
      code: "sata_option_rationale_missing",
      path: ["content", "options", 1, "rationale"],
      message: "Explain why options B and D are right or wrong.",
    });
  });

  it("names a single unexplained SATA option in the singular", () => {
    const base = FIXTURES.multiple_response.canonical;
    const rest = without(base.rationale?.perElement, "opt_a");
    const item = parse({ ...base, rationale: { ...base.rationale, perElement: rest } });
    expect(
      itemQualityWarnings(item).find((w) => w.code === "sata_option_rationale_missing")?.message,
    ).toBe("Explain why option A is right or wrong.");
  });

  it("does not ask Select N items for per-option explanations", () => {
    expect(codes(parse(FIXTURES.multiple_response.edge))).toEqual([]);
  });

  it("warns when most highlight phrases are correct, in text and in tables", () => {
    const text = parse({
      ...FIXTURES.highlight_text.canonical,
      answerKey: { correctSpanIds: ["sp_hr", "sp_bp", "sp_sat", "sp_urine"] },
    });
    expect(itemQualityWarnings(text)).toContainEqual(
      expect.objectContaining({
        code: "highlight_mostly_correct",
        path: ["answerKey", "correctSpanIds"],
      }),
    );
    const table = parse({
      ...FIXTURES.highlight_table.edge,
      answerKey: { correctSpanIds: ["a", "b", "c", "d"] },
    });
    expect(codes(table)).toContain("highlight_mostly_correct");
  });

  it("warns when the stem neither asks a question nor says what to do", () => {
    const item = parse({
      ...FIXTURES.multiple_choice.canonical,
      stem: { kind: "markdown", value: "A client with heart failure gained 2 kg in two days." },
    });
    expect(itemQualityWarnings(item)).toContainEqual({
      code: "stem_not_question",
      path: ["stem"],
      message: "The stem does not ask anything. End it with a question or say what to do.",
    });
  });

  it("warns about two options with the same text, pointing at the second", () => {
    const base = FIXTURES.multiple_choice.canonical;
    const options = base.content.options.map((option, index) =>
      index === 2
        ? { ...option, label: ` ${base.content.options[0].label.toUpperCase()} ` }
        : option,
    );
    const item = parse({ ...base, content: { ...base.content, options } });
    expect(itemQualityWarnings(item)).toContainEqual({
      code: "duplicate_option_text",
      path: ["content", "options", 2, "label"],
      message: "Option C reads the same as option A. Reword one of them.",
    });
  });

  it("finds repeated text in every kind of choice list", () => {
    const dupe = <T extends { label: string }>(list: readonly T[]): T[] =>
      list.map((entry, index) => (index === 1 ? { ...entry, label: list[0].label } : entry));

    const grouping = FIXTURES.multiple_response_grouping.canonical;
    const matrix = FIXTURES.matrix_multiple_choice.canonical;
    const table = FIXTURES.dropdown_table.canonical;
    const cloze = FIXTURES.dropdown_cloze.canonical;
    const drag = FIXTURES.dragdrop_cloze.canonical;
    const ordered = FIXTURES.ordered_response.canonical;
    const bowtie = FIXTURES.bowtie.canonical;
    const cases: [unknown, (string | number)[]][] = [
      [
        {
          ...grouping,
          content: {
            rows: grouping.content.rows.map((row, i) =>
              i === 0 ? { ...row, options: dupe(row.options) } : row,
            ),
          },
        },
        ["content", "rows", 0, "options", 1, "label"],
      ],
      [
        { ...matrix, content: { ...matrix.content, rows: dupe(matrix.content.rows) } },
        ["content", "rows", 1, "label"],
      ],
      [
        { ...matrix, content: { ...matrix.content, columns: dupe(matrix.content.columns) } },
        ["content", "columns", 1, "label"],
      ],
      [
        {
          ...table,
          content: {
            ...table.content,
            rows: table.content.rows.map((row, i) =>
              i === 0 ? { ...row, choices: dupe(row.choices) } : row,
            ),
          },
        },
        ["content", "rows", 0, "choices", 1, "label"],
      ],
      [
        {
          ...cloze,
          content: {
            ...cloze.content,
            blanks: cloze.content.blanks.map((blank, i) =>
              i === 0 ? { ...blank, choices: dupe(blank.choices) } : blank,
            ),
          },
        },
        ["content", "blanks", 0, "choices", 1, "label"],
      ],
      [
        { ...drag, content: { ...drag.content, bank: dupe(drag.content.bank) } },
        ["content", "bank", 1, "label"],
      ],
      [
        { ...ordered, content: { ...ordered.content, items: dupe(ordered.content.items) } },
        ["content", "items", 1, "label"],
      ],
      [
        { ...bowtie, content: { ...bowtie.content, parameters: dupe(bowtie.content.parameters) } },
        ["content", "parameters", 1, "label"],
      ],
    ];
    for (const [input, path] of cases) {
      const found = itemQualityWarnings(parse(input)).filter(
        (w) => w.code === "duplicate_option_text",
      );
      expect(found.map((w) => w.path)).toEqual([path]);
      expect(found[0]?.message).toMatch(/reads the same as/);
    }
  });

  it("checks case study step items like any other item", () => {
    for (const item of sampleCaseStudy.items) expect(codes(parse(item))).toEqual([]);
  });
});

describe("stemAsksSomething", () => {
  it.each([
    ["Which action should the nurse take first?", true],
    ["Complete the following sentence.", true],
    ["For each finding, indicate whether it has improved.", true],
    ["Place the nurse's actions in the correct order.", true],
    ["Drag words from the choices below to fill in each blank.", true],
    ["Click to highlight the findings that require follow-up.", true],
    ["A client was admitted with pneumonia.", false],
    ["The **client** is anxious.", false],
  ])("%s -> %s", (stem, expected) => {
    expect(stemAsksSomething(stem)).toBe(expected);
  });
});

describe("publishBlockers", () => {
  it("blocks an item without a general rationale", () => {
    const item = parse({ ...FIXTURES.bowtie.canonical, rationale: { perElement: {} } });
    expect(publishBlockers(item).map((w) => w.code)).toEqual(["rationale_missing"]);
  });

  it("lets advisory warnings through", () => {
    const base = FIXTURES.multiple_response.canonical;
    const item = parse({
      ...base,
      answerKey: { correctOptionIds: base.content.options.map((option) => option.id) },
    });
    expect(publishBlockers(item)).toEqual([]);
  });

  it("treats a blank rationale as missing", () => {
    const item = parse({
      ...FIXTURES.multiple_choice.canonical,
      rationale: { general: { kind: "markdown", value: "   " } },
    });
    expect(publishBlockers(item)).toHaveLength(1);
  });
});
