import { describe, expect, it } from "vitest";
import { emptyBowtieForm, fromBowtieForm, toBowtieForm } from "@/lib/authoring/forms/bowtie";
import {
  emptyOrderedResponseForm,
  fromOrderedResponseForm,
} from "@/lib/authoring/forms/orderedResponse";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { bowtieItemSchema, orderedResponseItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

describe("ordered response problems", () => {
  it("asks for each step's text by number", () => {
    const form = { ...emptyOrderedResponseForm("or_new"), stem: "Order these." };
    const parsed = orderedResponseItemSchema.safeParse(fromOrderedResponseForm(form));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(describeIssues(parsed.error.issues, "ordered_response")).toContainEqual({
      field: "steps.0.label",
      message: "Step 1 needs text.",
    });
  });
});

describe("bowtie problems", () => {
  const valid = () => toBowtieForm(bowtieItemSchema.parse(FIXTURES.bowtie.canonical));
  const problems = (form: ReturnType<typeof valid>) => {
    const parsed = bowtieItemSchema.safeParse(fromBowtieForm(form));
    if (parsed.success) return [];
    return describeIssues(parsed.error.issues, "bowtie", {
      bowtieMarked: {
        actions: form.actions.filter((choice) => choice.correct).length,
        parameters: form.parameters.filter((choice) => choice.correct).length,
      },
    });
  };

  it("has nothing to say about a valid bowtie", () => {
    expect(problems(valid())).toEqual([]);
  });

  it("says how many actions are marked when it is not two", () => {
    const form = valid();
    const actions = form.actions.map((choice, index) => ({ ...choice, correct: index === 0 }));
    expect(problems({ ...form, actions })).toContainEqual({
      field: "actions",
      message: "Mark exactly 2 actions to take (1 marked).",
    });
  });

  it("says how many parameters are marked when there are too many", () => {
    const form = valid();
    const parameters = form.parameters.map((choice, index) => ({ ...choice, correct: index < 3 }));
    expect(problems({ ...form, parameters })).toContainEqual({
      field: "parameters",
      message: "Mark exactly 2 parameters to monitor (3 marked).",
    });
  });

  it("asks for the condition and for each empty choice's text", () => {
    const form = { ...emptyBowtieForm("bt_new"), stem: "Complete the diagram." };
    const found = problems(form);
    expect(found).toContainEqual({
      field: "conditions.0.label",
      message: "Condition 1 needs text.",
    });
    expect(found).toContainEqual({ field: "actions.4.label", message: "Action 5 needs text." });
  });
});
