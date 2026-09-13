import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { orderedResponseItemSchema } from "@/lib/ngn/schemas";
import {
  emptyOrderedResponseForm,
  fromOrderedResponseForm,
  moveStep,
  orderedResponseFormFromStored,
  toOrderedResponseForm,
} from "./orderedResponse";
import { parseOrderedResponseDraft } from "./orderedResponseDraft";

const parse = (input: unknown) => orderedResponseItemSchema.parse(input);

describe("ordered response form mapping", () => {
  it.each([
    ["whole-item canonical", FIXTURES.ordered_response.canonical],
    ["per-position edge", FIXTURES.ordered_response.edge],
  ])("round-trips the %s fixture", (_name, input) => {
    const item = parse(input);
    expect(parse(fromOrderedResponseForm(toOrderedResponseForm(item)))).toEqual(item);
  });

  it("lists the steps in the key's order, which is the order the author writes them", () => {
    const form = toOrderedResponseForm(parse(FIXTURES.ordered_response.canonical));
    expect(form.steps.map((step) => step.id)).toEqual([
      "act_help",
      "act_cpr",
      "act_aed",
      "act_rhythm",
      "act_shock",
    ]);
  });

  it("scores one point for the exact order, or one per step with per-position scoring", () => {
    const whole = toOrderedResponseForm(parse(FIXTURES.ordered_response.canonical));
    const perPosition = toOrderedResponseForm(parse(FIXTURES.ordered_response.edge));
    expect(fromOrderedResponseForm(whole).scoring).toEqual({ model: "zero_one", maxPoints: 1 });
    expect(fromOrderedResponseForm(perPosition).scoring).toEqual({
      model: "zero_one",
      maxPoints: 4,
    });
  });

  it("makes the key follow a reordering", () => {
    const form = toOrderedResponseForm(parse(FIXTURES.ordered_response.edge));
    const moved = { ...form, steps: moveStep(form.steps, 2, -1) };
    expect(fromOrderedResponseForm(moved).answerKey.orderedIds).toEqual(["s1", "s3", "s2", "s4"]);
  });

  it("starts with four empty steps, invalid until each has text", () => {
    const form = emptyOrderedResponseForm("or_new");
    expect(form.steps).toHaveLength(4);
    expect(orderedResponseItemSchema.safeParse(fromOrderedResponseForm(form)).success).toBe(false);
  });
});

describe("moveStep", () => {
  it("swaps a step with its neighbour and ignores moves past either end", () => {
    expect(moveStep(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveStep(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveStep(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("does not change the list it is given", () => {
    const steps = ["a", "b"];
    moveStep(steps, 0, 1);
    expect(steps).toEqual(["a", "b"]);
  });
});

describe("orderedResponseFormFromStored", () => {
  it("opens a complete stored item exactly", () => {
    const item = parse(FIXTURES.ordered_response.edge);
    expect(orderedResponseFormFromStored(item, "row-id")).toEqual(toOrderedResponseForm(item));
  });

  it("keeps a draft's steps in its stored key order, and starts blank from nonsense", () => {
    const stored = {
      id: "or_draft",
      content: { items: [{ id: "x", label: "Second" }, { id: "y", label: "First" }, { nope: 1 }] },
      answerKey: { orderedIds: ["y", "x"] },
    };
    const form = orderedResponseFormFromStored(stored, "row-id");
    expect(form.steps.map((step) => step.label)).toEqual(["First", "Second"]);
    expect(orderedResponseFormFromStored(42, "row-id")).toEqual(emptyOrderedResponseForm("row-id"));
  });
});

describe("parseOrderedResponseDraft", () => {
  it("accepts both fixtures' forms and refuses extra fields or seven steps", () => {
    for (const input of [FIXTURES.ordered_response.canonical, FIXTURES.ordered_response.edge]) {
      const form = toOrderedResponseForm(parse(input));
      expect(parseOrderedResponseDraft(form)).toEqual({ ok: true, values: form });
    }
    const form = emptyOrderedResponseForm("or_new");
    expect(parseOrderedResponseDraft({ ...form, answerKey: {} }).ok).toBe(false);
    const steps = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, label: "", rationale: "" }));
    expect(parseOrderedResponseDraft({ ...form, steps }).ok).toBe(false);
  });
});
