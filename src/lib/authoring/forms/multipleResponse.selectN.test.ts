import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "../issueMessages";
import { fromMultipleResponseForm, toMultipleResponseForm } from "./multipleResponse";
import { parseMultipleResponseDraft } from "./multipleResponseDraft";

const selectN = () => ({
  ...toMultipleResponseForm(multipleResponseItemSchema.parse(FIXTURES.multiple_response.edge)),
});

describe("a blank Select N count", () => {
  it("is stored as missing rather than as a number, so the item asks for it", () => {
    const input = fromMultipleResponseForm({ ...selectN(), n: null });
    expect(input.content).not.toHaveProperty("n");
    const parsed = multipleResponseItemSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeIssues(parsed.error.issues, "multiple_response")).toContainEqual({
        field: "n",
        message: "Choose how many options to select. It must be fewer than the number of options.",
      });
    }
  });

  it("is accepted by Save draft, because drafts may be incomplete", () => {
    const form = { ...selectN(), n: null };
    expect(parseMultipleResponseDraft(form)).toEqual({ ok: true, values: form });
  });

  it("is never NaN in a saved draft", () => {
    expect(parseMultipleResponseDraft({ ...selectN(), n: Number.NaN }).ok).toBe(false);
  });
});
