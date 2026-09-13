import { describe, expect, it } from "vitest";
import { bowtieFormFromStored } from "./bowtie";
import { parseBowtieDraft } from "./bowtieDraft";
import { orderedResponseFormFromStored } from "./orderedResponse";
import { parseOrderedResponseDraft } from "./orderedResponseDraft";

describe("stored drafts with repeated ids", () => {
  it("gives every bowtie choice its own id when a stored draft reuses one across columns", () => {
    const stored = {
      id: "bt_draft",
      content: {
        actions: [
          { id: "x", label: "Assess" },
          { id: "x", label: "Assess again" },
        ],
        conditions: [{ id: "x", label: "Stroke" }],
        parameters: [{ id: "p1", label: "Blood pressure" }],
      },
      answerKey: { actionIds: ["x"], conditionId: "x", parameterIds: ["p1"] },
    };
    const form = bowtieFormFromStored(stored, "row-id");
    const ids = [...form.actions, ...form.conditions, ...form.parameters].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The first "x" keeps its id and its mark; the repeats are renamed.
    expect(form.actions[0]).toEqual({ id: "x", label: "Assess", correct: true });
    expect(form.actions[1].id).not.toBe("x");
    expect(form.conditions[0].label).toBe("Stroke");
    expect(form.conditions[0].id).not.toBe("x");
    // So the reopened draft can be saved again.
    expect(parseBowtieDraft(form).ok).toBe(true);
  });

  it("lists each ordered step once when a stored key repeats an id", () => {
    const stored = {
      id: "or_draft",
      content: {
        items: [
          { id: "a", label: "First" },
          { id: "b", label: "Second" },
          { id: "a", label: "First again" },
        ],
      },
      answerKey: { orderedIds: ["a", "a", "b"] },
    };
    const form = orderedResponseFormFromStored(stored, "row-id");
    expect(form.steps.map((step) => step.id)).toEqual(["a", "b"]);
    expect(form.steps[0].label).toBe("First");
    expect(parseOrderedResponseDraft(form).ok).toBe(true);
  });
});
