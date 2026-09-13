import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dragdropClozeItemSchema, dragdropRationaleItemSchema } from "@/lib/ngn/schemas";
import {
  dragDropFormFromStored,
  emptyDragDropForm,
  fromDragdropClozeForm,
  fromDragdropRationaleForm,
  toDragDropForm,
} from "./dragdrop";
import { parseDragDropDraft } from "./dragdropDraft";

const parseCloze = (input: unknown) => dragdropClozeItemSchema.parse(input);
const parseRationale = (input: unknown) => dragdropRationaleItemSchema.parse(input);

describe("drag-and-drop form mapping", () => {
  it.each([
    ["canonical", FIXTURES.dragdrop_cloze.canonical],
    ["reusable edge", FIXTURES.dragdrop_cloze.edge],
  ])("round-trips the drag-and-drop cloze %s fixture", (_name, input) => {
    const item = parseCloze(input);
    expect(parseCloze(fromDragdropClozeForm(toDragDropForm(item)))).toEqual(item);
  });

  it.each([
    ["dyad", FIXTURES.dragdrop_rationale.canonical],
    ["triad", FIXTURES.dragdrop_rationale.edge],
  ])("round-trips the drag-and-drop rationale %s fixture, anchor included", (_name, input) => {
    const item = parseRationale(input);
    expect(parseRationale(fromDragdropRationaleForm(toDragDropForm(item)))).toEqual(item);
  });

  it("writes the sentence with {{blankId}} markers and keeps the bank and reuse setting", () => {
    const form = toDragDropForm(parseCloze(FIXTURES.dragdrop_cloze.edge));
    expect(form.sentence).toBe(
      "Normal adult resting heart rate is {{b1}} to {{b2}} beats per minute.",
    );
    expect(form.bank.map((token) => token.label)).toEqual(["40", "60", "100", "120"]);
    expect(form.reusable).toBe(true);
    expect(form.blanks).toEqual([
      { id: "b1", correctTokenId: "t60", rationale: "" },
      { id: "b2", correctTokenId: "t100", rationale: "" },
    ]);
  });

  it("scores cloze one point per blank, and rationale one less than the blanks", () => {
    const cloze = toDragDropForm(parseCloze(FIXTURES.dragdrop_cloze.canonical));
    const dyad = toDragDropForm(parseRationale(FIXTURES.dragdrop_rationale.canonical));
    const triad = toDragDropForm(parseRationale(FIXTURES.dragdrop_rationale.edge));
    expect(fromDragdropClozeForm(cloze).scoring).toEqual({ model: "zero_one", maxPoints: 2 });
    expect(fromDragdropRationaleForm(dyad).scoring).toEqual({ model: "rationale", maxPoints: 1 });
    expect(fromDragdropRationaleForm(triad).scoring).toEqual({ model: "rationale", maxPoints: 2 });
  });

  it("starts a sentence with one blank and four empty words, invalid until filled in", () => {
    const form = emptyDragDropForm("dcz_new");
    expect(form.sentence).toBe("{{blank_1}}");
    expect(form.bank).toHaveLength(4);
    expect(form.reusable).toBe(false);
    expect(dragdropClozeItemSchema.safeParse(fromDragdropClozeForm(form)).success).toBe(false);
  });
});

describe("dragDropFormFromStored", () => {
  it("opens a complete stored item exactly", () => {
    const item = parseRationale(FIXTURES.dragdrop_rationale.edge);
    expect(dragDropFormFromStored(item, "row-id")).toEqual(toDragDropForm(item));
  });

  it("keeps a draft's sentence, bank and answers, and starts blank from nonsense", () => {
    const stored = {
      id: "dcz_draft",
      content: {
        tokens: [
          { kind: "text", value: "Give " },
          { kind: "blank", blankId: "b1" },
        ],
        blanks: [{ id: "b1" }],
        bank: [{ id: "t1", label: "oxygen" }, { id: 7 }],
        reusable: true,
      },
      answerKey: { blanks: [{ blankId: "b1", correctTokenId: "t1" }] },
    };
    const form = dragDropFormFromStored(stored, "row-id");
    expect(form.sentence).toBe("Give {{b1}}");
    expect(form.bank).toEqual([{ id: "t1", label: "oxygen" }]);
    expect(form.blanks).toEqual([{ id: "b1", correctTokenId: "t1", rationale: "" }]);
    expect(form.reusable).toBe(true);
    expect(dragDropFormFromStored("nonsense", "row-id")).toEqual(emptyDragDropForm("row-id"));
  });
});

describe("parseDragDropDraft", () => {
  it("accepts every fixture's form and a blank form", () => {
    for (const input of [FIXTURES.dragdrop_cloze.canonical, FIXTURES.dragdrop_cloze.edge]) {
      const form = toDragDropForm(parseCloze(input));
      expect(parseDragDropDraft(form)).toEqual({ ok: true, values: form });
    }
    expect(parseDragDropDraft(emptyDragDropForm("dcz_new")).ok).toBe(true);
  });

  it("refuses repeated word or blank ids, which would make answers ambiguous", () => {
    const form = emptyDragDropForm("dcz_new");
    const bank = form.bank.map((token) => ({ ...token, id: "tok_1" }));
    expect(parseDragDropDraft({ ...form, bank }).ok).toBe(false);
    const blanks = [form.blanks[0], { ...form.blanks[0] }];
    expect(parseDragDropDraft({ ...form, blanks }).ok).toBe(false);
  });

  it("refuses unknown fields and a bank over eight words", () => {
    const form = emptyDragDropForm("dcz_new");
    expect(parseDragDropDraft({ ...form, answerKey: {} }).ok).toBe(false);
    const bank = Array.from({ length: 9 }, (_, index) => ({ id: `t${index}`, label: "" }));
    expect(parseDragDropDraft({ ...form, bank }).ok).toBe(false);
  });
});
