import { describe, expect, it } from "vitest";
import { keyEvidence, locateOpenings, questionRegions, showsKey } from "./keyEvidence";

describe("showsKey", () => {
  it.each([
    ["a glued star", "B. *Assess the incision"],
    ["a spaced star", "A. Blood in the urine *"],
    ["a check mark", "✅ Answer: A"],
    ["an answer line", "Answer: B"],
    ["a correct order line", "Correct order: B, A, C"],
    ["a .docx highlight", "==needed three pillows=={yellow}"],
    ["a highlight that is also coloured", "==needed three pillows=={yellow, color #C00000}"],
    ["a highlighted option", "A. Rice\nB. ==Yogurt=={yellow}\nC. Juice"],
    [
      "a shaded key cell",
      "| Drug | Indicated | Not indicated |\n| --- | --- | --- |\n| Sodium | {shaded #FFFF00} | |\n| Potassium | | {shaded #FFFF00} |",
    ],
    [
      "a shaded key row",
      "| Option | Action |\n| --- | --- |\n| A | Wait |\n| {shaded #C6E0B4} B | {shaded #C6E0B4} Assess |\n| C | Call |",
    ],
    ["an X cell", "| Fever | X | |"],
  ])("sees %s", (_, region) => {
    expect(showsKey(region)).toBe(true);
    expect(keyEvidence(region)).toBe("marked");
  });

  it.each([
    ["plain options", "A. Rice\nB. Yogurt\n"],
    ["bold", "**Which** food first?"],
    ["a list bullet", "* Rice\n* Yogurt"],
    ["an empty table", "| Finding | Yes | No |\n| --- | --- | --- |\n| Fever | | |"],
    ["the word correct without a colon", "Which statement is correct?"],
  ])("sees nothing in %s", (_, region) => {
    expect(showsKey(region)).toBe(false);
    expect(keyEvidence(region)).toBe("none");
  });
});

describe("locateOpenings and questionRegions", () => {
  const text =
    "# Quiz\n\n## 1\n\nWhich **first**?\n\nA. One *\n\n## 2\n\nWhich\\_second?\n\nB. Two\n";

  it("finds each opening in order, ignoring markup and escapes", () => {
    const starts = locateOpenings(text, ["Which first?", "Which_second?", "Not here at all"]);
    expect(text.slice(starts[0], starts[0] + 5)).toBe("Which");
    expect(text.slice(starts[1], starts[1] + 5)).toBe("Which");
    expect(starts[2]).toBe(-1);
    expect(locateOpenings(text, ["?!"])).toEqual([-1]);
  });

  it("cuts the text at the next question, and gives null for one not found", () => {
    const [first, second, missing] = questionRegions(text, ["Which first", "Which second", "Gone"]);
    expect(first).toBe("Which **first**?\n\nA. One *\n\n## 2\n\n");
    expect(second).toBe("Which\\_second?\n\nB. Two\n");
    expect(missing).toBeNull();
    expect(showsKey(first!)).toBe(true);
    expect(showsKey(second!)).toBe(false);
  });

  // #592: `<u>first</u>` read as "u first u", so the question was not found and its key refused.
  it("finds an opening the model copied without the converter's markup", () => {
    const docx = [
      "1. The nurse notes the <u>first</u> sign of ==fluid overload=={yellow} in a client.",
      "| {shaded #D9D9D9} Finding | Value |\n| --- | --- |\n| Weight<br>today | 82 kg |",
      "2. The WBC is 12 x 10³/mm³ and the ==potassium=={color #C00000} is 3.1. What next?",
      "3. See [image] below. Which rhythm is shown?",
    ].join("\n\n");
    const starts = locateOpenings(docx, [
      "The nurse notes the first sign of fluid overload in a client.",
      "The WBC is 12 x 10^3/mm^3 and the potassium is 3.1.",
      "See below. Which rhythm is shown?",
      "Finding Value Weight today 82 kg",
    ]);
    expect(docx.slice(starts[0], starts[0] + 9)).toBe("The nurse");
    expect(docx.slice(starts[1], starts[1] + 7)).toBe("The WBC");
    expect(docx.slice(starts[2], starts[2] + 3)).toBe("See");
    expect(docx.slice(starts[3], starts[3] + 7)).toBe("Finding");
  });

  it("finds an opening the model copied without its struck-out words", () => {
    const docx = "1. The nurse ~~should~~ must assess the ~~left~~ right arm first.\n\nA. Yes";
    const [copied, skipped] = [
      locateOpenings(docx, ["The nurse should must assess the left right arm first."]),
      locateOpenings(docx, ["The nurse must assess the right arm first."]),
    ];
    expect(docx.slice(copied[0], copied[0] + 9)).toBe("The nurse");
    expect(skipped).toEqual(copied);
    expect(locateOpenings(docx, ["The nurse must assess the left leg first."])).toEqual([-1]);
  });
});
