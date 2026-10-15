import { describe, expect, it } from "vitest";
import { locateOpenings, questionRegions, showsKey } from "./keyEvidence";

describe("showsKey", () => {
  it.each([
    ["a glued star", "B. *Assess the incision"],
    ["a spaced star", "A. Blood in the urine *"],
    ["a check mark", "✅ Answer: A"],
    ["an answer line", "Answer: B"],
    ["a correct order line", "Correct order: B, A, C"],
    ["a .docx highlight", "==needed three pillows=={yellow}"],
    ["a shaded cell", "| {shaded #FFFF00} Indicated |"],
    ["an X cell", "| Fever | X | |"],
  ])("sees %s", (_, region) => {
    expect(showsKey(region)).toBe(true);
  });

  it.each([
    ["plain options", "A. Rice\nB. Yogurt\n"],
    ["bold", "**Which** food first?"],
    ["a list bullet", "* Rice\n* Yogurt"],
    ["an empty table", "| Finding | Yes | No |\n| --- | --- | --- |\n| Fever | | |"],
    ["the word correct without a colon", "Which statement is correct?"],
  ])("sees nothing in %s", (_, region) => {
    expect(showsKey(region)).toBe(false);
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
});
