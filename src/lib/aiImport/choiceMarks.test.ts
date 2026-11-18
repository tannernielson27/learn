import { describe, expect, it } from "vitest";
import { choiceMarks } from "./choiceMarks";
import { keyEvidence, showsKey } from "./keyEvidence";

/**
 * #592, owner decision 2026-11-17: bold, underline or font colour on some of a question's
 * choices is its key. Every case here was probed in both directions: what must count, and what
 * looks like it but is a stem, a label, a heading, a header or a note.
 */

const stem = "Which food should the nurse offer first?";
const lines = (...rows: string[]) => rows.join("\n");

describe("formatting on some of a list's choices", () => {
  it.each([
    ["a bold option", "A. Rice\n**B. Yogurt**\nC. Juice"],
    ["an option bold after its label", "A. Rice\nB. **Yogurt**\nC. Juice"],
    ["the first lettered option, bold", "**A. Rice**\nB. Yogurt\nC. Juice"],
    ["an underlined option", "a) Rice\nb) <u>Yogurt</u>\nc) Juice"],
    ["a coloured option", "1. Rice\n2. ==Yogurt=={color #C00000}\n3. Juice"],
    ["a bold, coloured bullet", "- Rice\n- ==**Yogurt**=={color #FF0000}\n- Juice"],
    ["a bold starred bullet", "* Rice\n* **Yogurt**\n* Juice"],
    ["two bold options of four", "A. Rice\n**B. Yogurt**\n**C. Milk**\nD. Juice"],
    [
      "select all that apply, three of five bold",
      "A. **Rice**\nB. Yogurt\nC. **Milk**\nD. Juice\nE. **Tea**",
    ],
    ["the first two bullets of three, bold", "- **Rice**\n- **Yogurt**\n- Juice"],
    ["a bold option in an indented list", "  a) Rice\n  b) **Yogurt**\n  c) Juice"],
    ["options typed as a paragraph each", "A. Rice\n\n**B. Yogurt**\n\nC. Juice"],
  ])("believes %s, and asks for a check", (_, options) => {
    const region = `${stem}\n\n${options}\n\n`;
    expect(keyEvidence(region)).toBe("formatting");
    expect(showsKey(region)).toBe(true);
  });

  it("believes a bold option under a numbered, bold stem", () => {
    const region = lines(
      "4. **Which action should the nurse take first?**",
      "1. Assess",
      "2. **Call**",
      "3. Wait",
      "4. Document",
    );
    expect(keyEvidence(region)).toBe("formatting");
  });

  // A stem that is itself a list item, at the same level as its own options.
  it.each([
    ["bold", "4. **Which action should the nurse take first?**"],
    ["underlined", "4. <u>Which action should the nurse take first?</u>"],
    ["coloured", "4. ==Which action should the nurse take first?=={color #C00000}"],
    ["bold, with no question mark", "4. **Select the priority action**"],
    ["bold, numbered 1 like its first option", "1. **Select the priority action.**"],
  ])("does not count a %s stem numbered like its options", (_, numbered) => {
    const region = lines(numbered, "1. Assess", "2. Call", "3. Wait", "4. Document");
    expect(keyEvidence(region)).toBe("none");
  });

  it("does not count a bold bullet that heads the bullets under it", () => {
    expect(keyEvidence(lines("- **Stem**", "- a", "- b"))).toBe("none");
    expect(keyEvidence(lines("- **Preload**", "- the volume", "- at end diastole"))).toBe("none");
    expect(keyEvidence(lines("* <u>Hypokalemia</u>", "* weakness", "* cramps"))).toBe("none");
  });

  // A rationale, a note or a label beside plain items is not a choice.
  it.each([
    [
      "a bold bullet under Rationale",
      lines("Q", "A. a", "B. b", "Rationale", "* **Why:**", "* text"),
    ],
    [
      "a bold reason in a rationale",
      lines(
        stem,
        "A. a",
        "B. b",
        "",
        "**Rationale:**",
        "- one reason",
        "- **the main reason**",
        "- another",
      ),
    ],
    [
      "a bold reason under a Rationale heading",
      lines(stem, "## Rationale", "1. first", "2. **second**"),
    ],
    [
      "a bold reason after an explanation",
      lines(stem, "Explanation: see below", "a. **yes**", "b. no"),
    ],
    ["a bold Note bullet", lines("- **Note**", "- text", "- more")],
    ["a bold Note with its text", lines("- text", "- **Note: give with food**", "- more")],
    ["a bold Priority label", lines("- **Priority:**", "- assess", "- call")],
    ["a bold label between plain items", lines("- assess", "- **Then:**", "- call")],
    ["a bold lettered label", lines("A. Rice", "B. **Answer key**", "C. Juice")],
    ["a bold step label", lines("1. **Step 2**", "2. assess", "3. call")],
    ["a bold question among the items", lines("A. Rice", "B. **Which is best?**", "C. Juice")],
  ])("does not count %s", (_, region) => {
    expect(keyEvidence(region)).toBe("none");
    expect(showsKey(region)).toBe(false);
  });

  it.each([
    ["bold in the stem", `**${stem}**\n\nA. Rice\nB. Yogurt`],
    ["a stem cut off before its closing bold", `${stem}**\n\nA. Rice\nB. Yogurt\n\n2. **`],
    ["a bold heading", `${stem}\n\nA. Rice\nB. Yogurt\n\n## **Section 2**`],
    ["a bold label on its own line", `${stem}\n\nA. Rice\nB. Yogurt\n\n**Question 4**`],
    ["a bold label on every option", `${stem}\n\n**A.** Rice\n**B.** Yogurt\n**C.** Juice`],
    ["a bold letter alone", `${stem}\n\nA. Rice\n**B.** Yogurt\nC. Juice`],
    ["every option bold", `${stem}\n\n**A. Rice**\n**B. Yogurt**\n**C. Juice**`],
    [
      "every option coloured",
      `${stem}\n\nA. ==Rice=={color #1F3864}\nB. ==Yogurt=={color #1F3864}`,
    ],
    ["one word of an option made bold", `${stem}\n\nA. Offer **only** rice\nB. Offer yogurt`],
    ["the word first underlined in an option", `${stem}\n\nA. Assess <u>first</u>\nB. Call`],
    ["a single bold list item", `${stem}\n\n- **Yogurt**`],
    ["a coloured word in the stem", `Which ==food=={color #C00000} first?\n\nA. Rice\nB. Yogurt`],
    ["an underlined stem phrase", `Which food is <u>not</u> offered?\n\nA. Rice\nB. Yogurt`],
    [
      "a bold numbered stem over lettered options",
      `1. **${stem}**\n\na. Rice\nb. Yogurt\nc. Juice`,
    ],
    ["a struck-out option", `${stem}\n\nA. Rice\nB. ~~Yogurt~~\nC. Juice`],
    [
      "a link inside an option",
      `${stem}\n\nA. See ==<u>https://example.org/guide</u>=={color #0563C1} first\nB. Yogurt`,
    ],
    [
      "an option that is a link",
      `${stem}\n\nA. Rice\nB. ==<u>https://example.org/guide</u>=={color #0563C1}\nC. Juice`,
    ],
  ])("does not count %s", (_, region) => {
    expect(keyEvidence(region)).toBe("none");
    expect(showsKey(region)).toBe(false);
  });

  it("counts a shaded option as a mark, like a highlight, and not shading on every option", () => {
    expect(keyEvidence(`${stem}\n\nA. Rice\nB. {shaded #FFFF00} Yogurt\nC. Juice`)).toBe("marked");
    expect(keyEvidence(`${stem}\n\nA. {shaded #FFFF00} Rice\nB. Yogurt\nC. Juice`)).toBe("marked");
    const every = `${stem}\n\nA. {shaded #F2F2F2} Rice\nB. {shaded #F2F2F2} Yogurt`;
    expect(keyEvidence(every)).toBe("none");
    expect(keyEvidence(lines("- {shaded #D9D9D9} Scenario", "- a", "- b"))).toBe("none");
  });

  it("keeps a list's own groups apart: a new list, a restart, another level", () => {
    // Two lists of the same kind, one after the other: the second starts again at A.
    const twoLists = lines("A. one", "B. two", "A. **three**", "B. **four**");
    expect(keyEvidence(twoLists)).toBe("none");
    // The bold line belongs to the outer list, alone at its level.
    const nested = lines("1. **Assess**", "  a. airway", "  b. breathing");
    expect(keyEvidence(nested)).toBe("none");
  });
});

describe("formatting on some of a table's choices", () => {
  const header = "| Finding | Expected | Unexpected |\n| --- | --- | --- |";

  it("believes a cell set apart from its column by bold, underline or colour", () => {
    for (const mark of [
      "**Unexpected**",
      "<u>Unexpected</u>",
      "==Unexpected=={color #C00000}",
      "**yes**",
    ]) {
      const region = lines(header, "| Fever | | no |", `| Pallor | no | ${mark} |`);
      expect(keyEvidence(region)).toBe("formatting");
    }
  });

  it("believes a matrix keyed by a bold cell in each row", () => {
    const region = lines(header, "| Fever | **yes** | |", "| Pallor | | **yes** |");
    expect(keyEvidence(region)).toBe("formatting");
  });

  it("believes a key row that is bold or shaded across every cell", () => {
    const options = "| Option | Action |\n| --- | --- |";
    expect(
      keyEvidence(lines(options, "| A | Wait |", "| **B** | **Assess** |", "| C | Call |")),
    ).toBe("formatting");
    expect(
      keyEvidence(
        lines(
          options,
          "| A | Wait |",
          "| {shaded #C6E0B4} B | {shaded #C6E0B4} Assess |",
          "| C | Call |",
        ),
      ),
    ).toBe("marked");
  });

  it("believes a marked row of a one-column table of options, the first body row too", () => {
    const table = (...rows: string[]) => lines("| Options |", "| --- |", ...rows);
    expect(keyEvidence(table("| Rice |", "| **Yogurt** |", "| Juice |"))).toBe("formatting");
    expect(keyEvidence(table("| **Rice** |", "| Yogurt |", "| Juice |"))).toBe("formatting");
    expect(keyEvidence(table("| {shaded #FFFF00} Rice |", "| Yogurt |", "| Juice |"))).toBe(
      "marked",
    );
    expect(keyEvidence(table("| Rice |", "| {shaded #FFFF00} Yogurt |", "| Juice |"))).toBe(
      "marked",
    );
  });

  it("believes shaded key cells, set apart, alone, or all in one column of a matrix", () => {
    expect(
      keyEvidence(lines(header, "| Fever | {shaded #FFFF00} yes | no |", "| Pallor | no | no |")),
    ).toBe("marked");
    expect(keyEvidence(lines(header, "| Fever | {shaded #FFFF00} | |", "| Pallor | | |"))).toBe(
      "marked",
    );
    expect(
      keyEvidence(
        lines(
          header,
          "| Fever | {shaded #FFFF00} | |",
          "| Pallor | {shaded #FFFF00} | |",
          "| Cough | {shaded #FFFF00} | |",
        ),
      ),
    ).toBe("marked");
    // The region opens inside the table: no header line, so every row is a body row.
    expect(
      keyEvidence(lines("| Fever | {shaded #FFFF00} | |", "| Pallor | | {shaded #FFFF00} |")),
    ).toBe("marked");
  });

  it("believes one bold line among the lines of a cell, but not its bold first line", () => {
    const cell = (text: string) =>
      lines("| Order | Action |", "| --- | --- |", `| Digoxin | ${text} |`);
    expect(
      keyEvidence(
        cell("Give with an antacid<br>**Hold if the pulse is below 60**<br>Double a dose"),
      ),
    ).toBe("formatting");
    expect(
      keyEvidence(cell("a. **Hold if the pulse is below 60**<br>b. Give with an antacid")),
    ).toBe("formatting");
    // A bold first line with no letter is the cell's own title.
    expect(keyEvidence(cell("**Digoxin 0.125 mg**<br>by mouth<br>daily"))).toBe("none");
  });

  it("reads an escaped bar as part of its cell", () => {
    const region = lines(header, "| a \\| b | **yes** | no |", "| c | no | no |");
    expect(keyEvidence(region)).toBe("formatting");
  });

  // A header row never counts, whatever its cells look like.
  it.each([
    ["a bold corner header", lines("| **Drug** | Dose |", "|---|---|", "| a | b |", "| c | d |")],
    [
      "one shaded header cell",
      lines("| Drug | {shaded #D9D9D9} Dose |", "|---|---|", "| a | b |", "| c | d |"),
    ],
    [
      "a shaded header row",
      lines(
        "| {shaded #D9D9D9} Finding | {shaded #D9D9D9} Expected | {shaded #D9D9D9} Unexpected |",
        "| --- | --- | --- |",
        "| Fever | | |",
      ),
    ],
    [
      "a bold header row",
      lines(
        "| **Finding** | **Expected** | **Unexpected** |",
        "| --- | --- | --- |",
        "| Fever | | |",
      ),
    ],
    [
      "a shaded title cell across the table",
      lines("| {shaded #D9D9D9} Vital signs |  |  |", "| --- | --- | --- |", "| Pulse | 88 | 92 |"),
    ],
    [
      "the bold title of a one-column chart",
      lines("| **Nurses' notes** |", "| --- |", "| 0800: reports nausea |", "| 0900: resting |"),
    ],
  ])("does not count %s", (_, region) => {
    expect(keyEvidence(region)).toBe("none");
  });

  it.each([
    [
      "a bold first column of labels",
      lines(header, "| **Fever** | | |", "| **Pallor** | | |", "| **Cough** | | |"),
    ],
    ["one bold label in the first column", lines(header, "| **Fever** | | |", "| Pallor | | |")],
    [
      "a chart with bold labels and plain values",
      lines(
        "| **Lab** | **Result** |",
        "| --- | --- |",
        "| **Sodium** | 135 |",
        "| **Potassium** | 3.1 |",
      ),
    ],
    [
      "a bold section row inside a chart",
      lines(
        "| Lab | Result |",
        "| --- | --- |",
        "| **Hematology** |  |",
        "| WBC | 12 |",
        "| Hgb | 11 |",
      ),
    ],
    [
      "a shaded first column",
      lines(header, "| {shaded #EEEEEE} Fever | | |", "| {shaded #EEEEEE} Pallor | | |"),
    ],
    [
      "banded rows",
      lines(
        header,
        "| {shaded #F2F2F2} Fever | {shaded #F2F2F2} a | {shaded #F2F2F2} b |",
        "| Pallor | c | d |",
        "| {shaded #F2F2F2} Cough | {shaded #F2F2F2} e | {shaded #F2F2F2} f |",
        "| Rash | g | h |",
        "| {shaded #F2F2F2} Chills | {shaded #F2F2F2} i | {shaded #F2F2F2} j |",
      ),
    ],
    ["every row bold", lines("| Option |", "| --- |", "| **Rice** |", "| **Yogurt** |")],
    ["one bold word in a cell", lines(header, "| Fever | is **not** expected | |")],
    [
      "a bold label row among the rows",
      lines(
        "| Option | Action |",
        "| --- | --- |",
        "| **Rationale:** | **see below** |",
        "| A | Wait |",
        "| B | Call |",
      ),
    ],
    // Left to the teacher: bold text cannot be told from a column of bold values in a chart.
    [
      "a column of bold text in every row",
      lines(header, "| Fever | **yes** | no |", "| Pallor | **yes** | no |"),
    ],
  ])("does not count %s", (_, region) => {
    expect(keyEvidence(region)).toBe("none");
  });

  it("ends a table at a blank line, so the next table's header is still a header", () => {
    const region = lines(
      "| Drug | Dose |",
      "| --- | --- |",
      "| a | b |",
      "",
      "| **Lab** | Result |",
      "| --- | --- |",
      "| c | d |",
      "| e | f |",
    );
    expect(keyEvidence(region)).toBe("none");
  });
});

describe("choiceMarks", () => {
  it("tells shading from bold, underline and colour", () => {
    expect(choiceMarks("A. Rice\nB. {shaded #FFFF00} Yogurt")).toEqual({
      shading: true,
      emphasis: false,
    });
    expect(choiceMarks("A. Rice\n**B. Yogurt**")).toEqual({ shading: false, emphasis: true });
    expect(choiceMarks("A. Rice\nB. Yogurt")).toEqual({ shading: false, emphasis: false });
    expect(choiceMarks("")).toEqual({ shading: false, emphasis: false });
  });
});
