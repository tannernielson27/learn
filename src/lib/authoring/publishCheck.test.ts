import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { checkPublishable, PUBLISH_CHECK_ERRORS } from "./publishCheck";

describe("checkPublishable", () => {
  it("passes a whole item of the expected type, with its warnings left as advice", () => {
    const base = FIXTURES.multiple_response.canonical;
    const allCorrect = {
      ...base,
      answerKey: { correctOptionIds: base.content.options.map((option) => option.id) },
    };
    const result = checkPublishable(allCorrect, "multiple_response");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.id).toBe(base.id);
  });

  it("refuses an item that does not validate, or is another type", () => {
    expect(checkPublishable({ type: "multiple_choice" }, "multiple_choice")).toEqual({
      ok: false,
      error: PUBLISH_CHECK_ERRORS.incomplete,
    });
    expect(checkPublishable(FIXTURES.bowtie.canonical, "multiple_choice")).toEqual({
      ok: false,
      error: PUBLISH_CHECK_ERRORS.incomplete,
    });
  });

  it("refuses an item with no general rationale, and says where to write it", () => {
    for (const rationale of [undefined, {}, { general: { kind: "markdown", value: " " } }]) {
      expect(
        checkPublishable({ ...FIXTURES.multiple_choice.canonical, rationale }, "multiple_choice"),
      ).toEqual({ ok: false, error: PUBLISH_CHECK_ERRORS.noRationale });
    }
    expect(PUBLISH_CHECK_ERRORS.noRationale).toMatch(/Rationale/);
  });

  it("holds case study step items to the same rule", () => {
    const step = { ...FIXTURES.ordered_response.canonical, cjmmStep: 5, rationale: {} };
    expect(checkPublishable(step, "ordered_response")).toEqual({
      ok: false,
      error: PUBLISH_CHECK_ERRORS.noRationale,
    });
  });
});
