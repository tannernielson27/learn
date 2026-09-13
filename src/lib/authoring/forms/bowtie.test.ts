import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { bowtieItemSchema } from "@/lib/ngn/schemas";
import { bowtieFormFromStored, emptyBowtieForm, fromBowtieForm, toBowtieForm } from "./bowtie";
import { parseBowtieDraft } from "./bowtieDraft";

const parse = (input: unknown) => bowtieItemSchema.parse(input);

describe("bowtie form mapping", () => {
  it.each([
    ["canonical (default column labels)", FIXTURES.bowtie.canonical],
    ["edge (labels written out)", FIXTURES.bowtie.edge],
  ])("round-trips the %s fixture", (_name, input) => {
    const item = parse(input);
    expect(parse(fromBowtieForm(toBowtieForm(item)))).toEqual(item);
  });

  it("marks the two correct actions and parameters, and the one correct condition", () => {
    const form = toBowtieForm(parse(FIXTURES.bowtie.canonical));
    expect(form.actions.filter((choice) => choice.correct).map((choice) => choice.id)).toEqual([
      "act_ecg",
      "act_aspirin",
    ]);
    expect(form.conditionId).toBe("cond_mi");
    expect(form.parameters.filter((choice) => choice.correct)).toHaveLength(2);
  });

  it("is always worth five points", () => {
    const form = toBowtieForm(parse(FIXTURES.bowtie.edge));
    expect(fromBowtieForm(form).scoring).toEqual({ model: "zero_one", maxPoints: 5 });
  });

  it("starts with 5, 4 and 5 empty choices and default column labels, invalid until filled in", () => {
    const form = emptyBowtieForm("bt_new");
    expect([form.actions.length, form.conditions.length, form.parameters.length]).toEqual([
      5, 4, 5,
    ]);
    expect(form.columnLabels.actions).toBe("Actions to Take");
    expect(bowtieItemSchema.safeParse(fromBowtieForm(form)).success).toBe(false);
  });
});

describe("bowtieFormFromStored", () => {
  it("opens a complete stored item exactly", () => {
    const item = parse(FIXTURES.bowtie.canonical);
    expect(bowtieFormFromStored(item, "row-id")).toEqual(toBowtieForm(item));
  });

  it("keeps a draft's choices and marks, padding each column to its fixed size", () => {
    const stored = {
      id: "bt_draft",
      content: { actions: [{ id: "a1", label: "Assess" }], conditions: "nope" },
      answerKey: { actionIds: ["a1"], conditionId: "c9" },
    };
    const form = bowtieFormFromStored(stored, "row-id");
    expect(form.actions).toHaveLength(5);
    expect(form.actions[0]).toEqual({ id: "a1", label: "Assess", correct: true });
    expect(form.conditions).toHaveLength(4);
    expect(form.conditionId).toBe("c9");
    expect(bowtieFormFromStored(null, "row-id")).toEqual(emptyBowtieForm("row-id"));
  });
});

describe("parseBowtieDraft", () => {
  it("accepts both fixtures' forms and refuses a sixth action or extra fields", () => {
    for (const input of [FIXTURES.bowtie.canonical, FIXTURES.bowtie.edge]) {
      const form = toBowtieForm(parse(input));
      expect(parseBowtieDraft(form)).toEqual({ ok: true, values: form });
    }
    const form = emptyBowtieForm("bt_new");
    expect(parseBowtieDraft({ ...form, answerKey: {} }).ok).toBe(false);
    const actions = [...form.actions, { id: "action_6", label: "", correct: false }];
    expect(parseBowtieDraft({ ...form, actions }).ok).toBe(false);
  });
});
