import { describe, expect, it } from "vitest";
import { findRetiredTerms, readableStrings, visibleWordCount } from "./retiredTerms";

const found = (html: string) => findRetiredTerms(html).map((hit) => hit.found.toLowerCase());

describe("the control: the check can fail", () => {
  it("finds the old page heading in visible text", () => {
    expect(found("<h1>Item banks</h1>")).toEqual(["banks", "item"]);
  });

  it("finds an old term in an aria-label, a title, a placeholder and alt text", () => {
    expect(found('<ul aria-label="Item banks"></ul>')).toEqual(["banks", "item"]);
    expect(found('<a title="Rename bank">x</a>')).toEqual(["bank"]);
    expect(found('<input placeholder="Search items">')).toEqual(["items"]);
    expect(found('<img alt="Your instructor">')).toEqual(["instructor"]);
  });

  it("finds an old term in a page title passed on its own", () => {
    expect(found("Item bank")).toEqual(["bank", "item"]);
  });

  it.each([
    ["Unfiled", "unfiled"],
    ["All content", "all content"],
    ["3 of 10 members", "members"],
    ["Instructor-paced", "instructor"],
    ["The session could not be started.", "session"],
    ["That item type cannot be authored yet.", "item"],
    ["Assigning these as graded work later shows a warning.", "graded work"],
    ["Make a class", "make a class"],
    ["Delete this quiz", "delete this quiz"],
    ["CJMM step", "cjmm"],
    ["Type the live session code on the screen.", "session code"],
  ])("finds the retired wording in %j", (text, term) => {
    expect(found(`<p>${text}</p>`)).toContain(term);
  });
});

describe("what the check leaves alone", () => {
  it.each([
    "Quizzes",
    "New question",
    "Word bank",
    "Start a live session",
    "Live sessions",
    "12 in this session",
    "Teacher-paced",
    "Not in a folder",
    "Delete folder",
    "Delete assignment",
    "3 of 10 teachers",
  ])("passes %j", (text) => {
    expect(findRetiredTerms(`<p>${text}</p>`)).toEqual([]);
  });

  it("ignores routes, ids, field names, class names and scripts", () => {
    const html =
      '<a href="/author/banks/1" class="items-center" id="bank-search-q">Open</a>' +
      '<input name="item" value="unfiled"><script>const bank = "item";</script>';
    expect(findRetiredTerms(html)).toEqual([]);
  });
});

describe("readableStrings", () => {
  it("returns the text once, then each read attribute, with entities decoded", () => {
    expect(
      readableStrings(
        '<p>Ada&#x27;s <b>quiz</b></p><button aria-label="Close &amp; save">x</button>',
      ),
    ).toEqual(["Ada's quiz x", "Close & save"]);
  });
});

describe("visibleWordCount", () => {
  it("counts words in text, and not attributes, punctuation or markup", () => {
    expect(
      visibleWordCount('<h1 aria-label="Four more words here">Two words</h1><p>/ and — one</p>'),
    ).toBe(4);
    expect(visibleWordCount("<div></div>")).toBe(0);
  });

  it("counts a closed disclosure's summary and not its body, and all of an open one", () => {
    const body = "<summary>Rename quiz</summary><p>Quiz name here</p>";
    expect(visibleWordCount(`<details class="x">${body}</details>`)).toBe(2);
    expect(visibleWordCount(`<details open="">${body}</details>`)).toBe(5);
  });

  it("leaves out a dialog that is not open", () => {
    expect(visibleWordCount("<p>One</p><dialog><p>Are you sure</p></dialog>")).toBe(1);
    expect(visibleWordCount('<dialog open=""><p>Are you sure</p></dialog>')).toBe(3);
  });

  it("leaves out the choices inside a select", () => {
    expect(
      visibleWordCount("<label>Time zone</label><select><option>Denver time</option></select>"),
    ).toBe(2);
  });
});
