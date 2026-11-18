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
    ["a shaded cell", "| Sodium | {shaded #FFFF00} Indicated | Not indicated |"],
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

// #592, owner decision 2026-11-17: bold, underline or font colour on one choice is its key.
describe("keyEvidence from formatting that sets one choice apart", () => {
  const stem = "Which food should the nurse offer first?";

  it.each([
    ["a bold option", "A. Rice\n**B. Yogurt**\nC. Juice"],
    ["an option bold after its label", "A. Rice\nB. **Yogurt**\nC. Juice"],
    ["a bold label, when the other labels are not", "A. Rice\n**B.** Yogurt\nC. Juice"],
    ["an underlined option", "a) Rice\nb) <u>Yogurt</u>\nc) Juice"],
    ["a coloured option", "1. Rice\n2. ==Yogurt=={color #C00000}\n3. Juice"],
    ["a bold, coloured option", "- Rice\n- ==**Yogurt**=={color #FF0000}\n- Juice"],
    ["two bold options of four", "A. Rice\n**B. Yogurt**\n**C. Milk**\nD. Juice"],
    ["a bold option in an indented list", "  a) Rice\n  b) **Yogurt**\n  c) Juice"],
    [
      "the one full-bold option among bold labels",
      "**A.** Rice\n**B. Yogurt**\n**C.** Juice\n**D.** Tea",
    ],
    ["a bold starred bullet", "* Rice\n* **Yogurt**\n* Juice"],
  ])("believes %s, and asks for a check", (_, options) => {
    const region = `${stem}\n\n${options}\n\n`;
    expect(keyEvidence(region)).toBe("formatting");
    expect(showsKey(region)).toBe(true);
  });

  it.each([
    ["bold in the stem", `**${stem}**\n\nA. Rice\nB. Yogurt`],
    ["a stem cut off before its closing bold", `${stem}**\n\nA. Rice\nB. Yogurt\n\n2. **`],
    ["a bold heading", `${stem}\n\nA. Rice\nB. Yogurt\n\n## **Section 2**`],
    ["a bold label on its own line", `${stem}\n\nA. Rice\nB. Yogurt\n\n**Question 4**`],
    ["a bold label on every option", `${stem}\n\n**A.** Rice\n**B.** Yogurt\n**C.** Juice`],
    ["every option bold", `${stem}\n\n**A. Rice**\n**B. Yogurt**\n**C. Juice**`],
    [
      "every option coloured",
      `${stem}\n\nA. ==Rice=={color #1F3864}\nB. ==Yogurt=={color #1F3864}`,
    ],
    ["one word of an option made bold", `${stem}\n\nA. Offer **only** rice\nB. Offer yogurt`],
    ["a single bold list item", `${stem}\n\n- **Yogurt**`],
    ["a coloured word in the stem", `Which ==food=={color #C00000} first?\n\nA. Rice\nB. Yogurt`],
    ["an underlined stem phrase", `Which food is <u>not</u> offered?\n\nA. Rice\nB. Yogurt`],
    ["a bold question number in a numbered stem", `1. **${stem}**\n\na. Rice\nb. Yogurt\nc. Juice`],
    ["a struck-out option", `${stem}\n\nA. Rice\nB. ~~Yogurt~~\nC. Juice`],
  ])("does not count %s", (_, region) => {
    expect(keyEvidence(region)).toBe("none");
    expect(showsKey(region)).toBe(false);
  });

  it("counts a shaded list item as a mark, like a highlight", () => {
    const region = `${stem}\n\nA. Rice\nB. {shaded #FFFF00} Yogurt\nC. Juice`;
    expect(keyEvidence(region)).toBe("marked");
    const every = `${stem}\n\nA. {shaded #F2F2F2} Rice\nB. {shaded #F2F2F2} Yogurt`;
    expect(keyEvidence(every)).toBe("none");
  });
});

describe("keyEvidence in tables", () => {
  const table = (...rows: string[]) => rows.join("\n");
  const header = "| Finding | Expected | Unexpected |\n| --- | --- | --- |";

  it("believes a cell set apart by bold, underline or colour", () => {
    for (const mark of [
      "**Unexpected**",
      "<u>Unexpected</u>",
      "==Unexpected=={color #C00000}",
      "**yes**",
    ]) {
      const region = table(header, "| Fever | | no |", `| Pallor | no | ${mark} |`);
      expect(keyEvidence(region)).toBe("formatting");
    }
  });

  it("believes one bold line among the lines of a cell", () => {
    const region = table(
      "| Order | Action |",
      "| --- | --- |",
      "| Digoxin | **Hold if the pulse is below 60**<br>Give with an antacid<br>Double a missed dose |",
    );
    expect(keyEvidence(region)).toBe("formatting");
  });

  it("believes a bold row of a one-column table of options, but not its title", () => {
    const options = table("| Options |", "| --- |", "| Rice |", "| **Yogurt** |", "| Juice |");
    expect(keyEvidence(options)).toBe("formatting");
    const chart = table("| **Nurses' notes** |", "| --- |", "| 0800: reports nausea |");
    expect(keyEvidence(chart)).toBe("none");
  });

  // The side effect #592 fixes: a grey header row used to pass for every question beside it.
  it.each([
    [
      "a shaded header row",
      table(
        "| {shaded #D9D9D9} Finding | {shaded #D9D9D9} Expected | {shaded #D9D9D9} Unexpected |",
        "| --- | --- | --- |",
        "| Fever | | |",
      ),
    ],
    [
      "a bold header row",
      table(
        "| **Finding** | **Expected** | **Unexpected** |",
        "| --- | --- | --- |",
        "| Fever | | |",
      ),
    ],
    [
      "a shaded title cell across the table",
      table("| {shaded #D9D9D9} Vital signs |  |  |", "| --- | --- | --- |", "| Pulse | 88 | 92 |"),
    ],
    [
      "a bold first column of labels",
      table(header, "| **Fever** | | |", "| **Pallor** | | |", "| **Cough** | | |"),
    ],
    [
      "a chart with bold labels and plain values",
      table(
        "| **Lab** | **Result** |",
        "| --- | --- |",
        "| **Sodium** | 135 |",
        "| **Potassium** | 3.1 |",
      ),
    ],
    [
      "a shaded first column",
      table(header, "| {shaded #EEEEEE} Fever | | |", "| {shaded #EEEEEE} Pallor | | |"),
    ],
    [
      "striped rows",
      table(
        header,
        "| {shaded #F2F2F2} Fever | {shaded #F2F2F2} a | {shaded #F2F2F2} b |",
        "| Pallor | c | d |",
        "| {shaded #F2F2F2} Cough | {shaded #F2F2F2} e | {shaded #F2F2F2} f |",
      ),
    ],
    ["one bold word in a cell", table(header, "| Fever | is **not** expected | |")],
  ])("does not count %s", (_, region) => {
    expect(keyEvidence(region)).toBe("none");
  });

  it("still counts a shaded cell that is set apart, text or none", () => {
    expect(keyEvidence(table(header, "| Fever | {shaded #FFFF00} | |", "| Pallor | | |"))).toBe(
      "marked",
    );
    expect(
      keyEvidence(table(header, "| Fever | {shaded #FFFF00} yes | no |", "| Pallor | no | no |")),
    ).toBe("marked");
  });

  it("reads an escaped bar as part of its cell", () => {
    const region = table(header, "| a \\| b | **yes** | no |", "| c | no | no |");
    expect(keyEvidence(region)).toBe("formatting");
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
