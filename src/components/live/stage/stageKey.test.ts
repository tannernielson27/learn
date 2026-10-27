import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item, type ItemType } from "@/lib/ngn/schemas";
import { notCorrect, stageKey } from "./stageKey";

const parse = (type: ItemType): Item => itemSchema.parse(FIXTURES[type].canonical) as Item;

describe("stageKey", () => {
  it("is nothing before the answer is showing, however much the host holds", () => {
    expect(stageKey(parse("bowtie"), false)).toBeNull();
    expect(stageKey(null, true)).toBeNull();
  });

  it("is the item, key and all, once the answer is showing", () => {
    const item = parse("bowtie");
    expect(stageKey(item, true)).toBe(item);
  });
});

describe("notCorrect", () => {
  it("lists each bowtie column's choices the key leaves out, under the column's own name", () => {
    expect(notCorrect(parse("bowtie"))).toEqual([
      {
        label: "Actions to Take",
        options: [
          "Encourage ambulation to relieve anxiety",
          "Apply a heating pad to the chest",
          "Offer a full liquid meal",
        ],
      },
      {
        label: "Potential Condition",
        options: ["Gastroesophageal reflux", "Costochondritis", "Panic attack"],
      },
      {
        label: "Parameters to Monitor",
        options: ["Bowel sounds", "Oral temperature", "Pupil size"],
      },
    ]);
  });

  it("lists a drop-down's other choices blank by blank", () => {
    expect(notCorrect(parse("dropdown_cloze"))).toEqual([
      { label: "Blank 1", options: ["seizure activity", "respiratory alkalosis"] },
      {
        label: "Blank 2",
        options: ["encourage oral potassium-rich foods", "apply a warm compress"],
      },
    ]);
  });

  it("names a drop-down table's groups by their row", () => {
    const groups = notCorrect(parse("dropdown_table"));
    expect(groups[0]).toEqual({
      label: "Digoxin 0.125 mg PO",
      options: ["Check blood glucose", "Assess pain level"],
    });
    expect(groups.every((group) => group.options.length > 0)).toBe(true);
  });

  it("lists the word bank's tokens the key never places", () => {
    for (const type of ["dragdrop_cloze", "dragdrop_rationale"] as const) {
      const item = parse(type);
      if (item.type !== type) throw new Error(type);
      const keyed = new Set(item.answerKey.blanks.map((blank) => blank.correctTokenId));
      const [group] = notCorrect(item);
      expect(group?.label).toBeNull();
      expect(group?.options).toEqual(
        item.content.bank.filter((token) => !keyed.has(token.id)).map((token) => token.label),
      );
    }
  });

  it("names a single blank's group by nothing, and a rationale's blanks by number", () => {
    const one = parse("dropdown_cloze");
    if (one.type !== "dropdown_cloze") throw new Error("dropdown_cloze");
    const single = {
      ...one,
      content: { ...one.content, blanks: one.content.blanks.slice(0, 1) },
      answerKey: { blanks: one.answerKey.blanks.slice(0, 1) },
    };
    expect(notCorrect(single)[0]?.label).toBeNull();
    expect(notCorrect(parse("dropdown_rationale")).map((group) => group.label)).toEqual([
      "Blank 1",
      "Blank 2",
      "Blank 3",
    ]);
  });

  it("lists nothing for a layout that already draws every choice beside the key", () => {
    for (const type of [
      "multiple_choice",
      "multiple_response",
      "multiple_response_grouping",
      "matrix_multiple_choice",
      "matrix_multiple_response",
      "highlight_text",
      "highlight_table",
      "ordered_response",
    ] as const) {
      expect(notCorrect(parse(type))).toEqual([]);
    }
  });
});
