import { describe, expect, it } from "vitest";
import {
  findRetiredTerms,
  readText,
  spokenAttributes,
  visibleText,
  wordCount,
} from "./retiredTerms";

describe("findRetiredTerms", () => {
  // The control: each line is wording the product had before the glossary (#410).
  it.each([
    ["Go to your item banks", "bank"],
    ["Open a question bank to see what is already here", "bank"],
    ["Write items", "item"],
    ["Instructor guide", "instructor"],
    ["Join your instructor’s class.", "instructor"],
    ["Fast authoring", "author"],
    ["Press End session when you are done.", "session alone"],
    ["Instructor-paced: you move the room.", "room"],
    ["Read by Students, Items and CJMM steps", "CJMM"],
    ["with the chart beside the question", "chart"],
    ["The record then offers a time selector.", "record alone"],
    ["Assign take-home work", "take-home work"],
    ["Assign work or run a live session", "take-home work"],
    ["Run a live session", "run, for a live session"],
    ["published, ready to assign or run live", "run, for a live session"],
    ["Make a class", "make, for something a teacher creates"],
    ["including runs already started in a practice run", "practice run"],
  ])("finds the retired word in %j", (text, term) => {
    expect(findRetiredTerms(text).join("\n")).toContain(`"${term}"`);
  });

  it.each([
    "Go to your quizzes",
    "Teacher guide",
    "Start a live session, then End live session in the lobby.",
    "Completing prose from a word bank of 4 to 8 words.",
    "The patient record sits beside every question.",
    "12 in this session",
    "Oxygen saturation 88% on room air",
    "Write questions and run them with a class.",
    "A quiz or a case study run in class, with students answering on their phones.",
    "New quiz opens the form, and Create quiz saves it.",
    "Your account is ready. An account was made with this address.",
    "The link works once. How it is scored.",
  ])("leaves the glossary's own wording alone: %j", (text) => {
    expect(findRetiredTerms(text)).toEqual([]);
  });

  it("reads past case, curly quotes and line breaks", () => {
    expect(findRetiredTerms("ITEM\n  BANKS")).not.toEqual([]);
    expect(findRetiredTerms("your INSTRUCTOR’S class")).not.toEqual([]);
  });

  it("says which word, what to say instead, and where", () => {
    const [found] = findRetiredTerms("Sort a large bank into folders.");
    expect(found).toContain('"bank" (say: quiz)');
    expect(found).toContain("sort a large bank into folders");
  });
});

describe("readText", () => {
  const html =
    '<main class="items-center"><a href="/help/items" aria-label="Item guide">Guide</a>' +
    '<img alt="A Bowtie item" src="/help/bowtie.png"><input placeholder="Bank name">' +
    "<script>const instructor = 1;</script><p>Tom &amp; Ada&#39;s   class</p></main>";

  it("keeps text and drops tags, scripts, addresses and class names", () => {
    expect(visibleText(html)).toBe("Guide Tom & Ada's class");
  });

  it("reads labels, alt text and placeholders", () => {
    expect(spokenAttributes(html)).toEqual(["Item guide", "A Bowtie item", "Bank name"]);
  });

  it("finds a retired word in a label even when the text is clean", () => {
    expect(findRetiredTerms(visibleText(html))).toEqual([]);
    expect(findRetiredTerms(readText(html)).join("\n")).toContain('"item"');
  });
});

describe("wordCount", () => {
  it("counts words, not punctuation or space", () => {
    expect(wordCount("  Sign in · or  create an account. ")).toBe(6);
    expect(wordCount("")).toBe(0);
  });
});
