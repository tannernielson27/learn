import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dropdownClozeItemSchema, dropdownRationaleItemSchema } from "@/lib/ngn/schemas";
import {
  emptyClozeForm,
  fromDropdownClozeForm,
  fromDropdownRationaleForm,
  sentenceToTokens,
  toClozeForm,
  tokensToSentence,
} from "./cloze";

const parseCloze = (input: unknown) => dropdownClozeItemSchema.parse(input);
const parseRationale = (input: unknown) => dropdownRationaleItemSchema.parse(input);

describe("sentence markers", () => {
  it.each([
    ["dropdown cloze canonical", FIXTURES.dropdown_cloze.canonical.content.tokens],
    ["dropdown cloze edge", FIXTURES.dropdown_cloze.edge.content.tokens],
    ["dropdown rationale triad", FIXTURES.dropdown_rationale.canonical.content.tokens],
    ["dropdown rationale dyad", FIXTURES.dropdown_rationale.edge.content.tokens],
  ])("turns %s tokens into a marked sentence and back unchanged", (_name, tokens) => {
    expect(sentenceToTokens(tokensToSentence(tokens))).toEqual(tokens);
  });

  it("writes a blank as {{id}} between the surrounding text", () => {
    expect(
      tokensToSentence([
        { kind: "text", value: "Give " },
        { kind: "blank", blankId: "b1" },
        { kind: "text", value: " now." },
      ]),
    ).toBe("Give {{b1}} now.");
  });

  it("leaves text that only looks like a marker alone when it is not a valid id", () => {
    expect(sentenceToTokens("Dose {{not an id}} mg")).toEqual([
      { kind: "text", value: "Dose {{not an id}} mg" },
    ]);
  });
});

describe("cloze form mapping", () => {
  it.each([
    ["canonical", FIXTURES.dropdown_cloze.canonical],
    ["edge", FIXTURES.dropdown_cloze.edge],
  ])("round-trips the dropdown cloze %s fixture", (_name, input) => {
    const item = parseCloze(input);
    expect(parseCloze(fromDropdownClozeForm(toClozeForm(item)))).toEqual(item);
  });

  it.each([
    ["triad", FIXTURES.dropdown_rationale.canonical],
    ["dyad", FIXTURES.dropdown_rationale.edge],
  ])("round-trips the dropdown rationale %s fixture, anchor included", (_name, input) => {
    const item = parseRationale(input);
    expect(parseRationale(fromDropdownRationaleForm(toClozeForm(item)))).toEqual(item);
  });

  it("scores dropdown cloze one point per blank", () => {
    const form = toClozeForm(parseCloze(FIXTURES.dropdown_cloze.canonical));
    expect(fromDropdownClozeForm(form).scoring).toEqual({ model: "zero_one", maxPoints: 2 });
  });

  it("scores a rationale dyad as one point and a triad as two", () => {
    const triad = toClozeForm(parseRationale(FIXTURES.dropdown_rationale.canonical));
    const dyad = toClozeForm(parseRationale(FIXTURES.dropdown_rationale.edge));
    expect(fromDropdownRationaleForm(triad).scoring).toEqual({ model: "rationale", maxPoints: 2 });
    expect(fromDropdownRationaleForm(dyad).scoring).toEqual({ model: "rationale", maxPoints: 1 });
  });

  it("fails validation when the sentence names a blank the item does not define", () => {
    const form = toClozeForm(parseCloze(FIXTURES.dropdown_cloze.canonical));
    const broken = { ...form, sentence: `${form.sentence} Then {{blank_9}}.` };
    expect(dropdownClozeItemSchema.safeParse(fromDropdownClozeForm(broken)).success).toBe(false);
  });

  it("starts a new sentence with one blank of three blank choices, invalid until filled in", () => {
    const form = emptyClozeForm("ddc_new");
    expect(form.blanks).toHaveLength(1);
    expect(form.sentence).toContain(`{{${form.blanks[0].id}}}`);
    expect(form.blanks[0].choices).toHaveLength(3);
    expect(dropdownClozeItemSchema.safeParse(fromDropdownClozeForm(form)).success).toBe(false);
  });
});
