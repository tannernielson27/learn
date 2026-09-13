import { describe, expect, it } from "vitest";
import { stemExcerpt } from "./banks";

describe("stemExcerpt", () => {
  it("reads the markdown stem as plain text", () => {
    expect(
      stemExcerpt({ kind: "markdown", value: "**Which** findings\n\nneed _follow-up_?" }),
    ).toBe("Which findings need follow-up?");
  });

  it("shortens a long stem on a word boundary with an ellipsis", () => {
    const excerpt = stemExcerpt({ kind: "markdown", value: "word ".repeat(60) }, 20);
    expect(excerpt.length).toBeLessThanOrEqual(20);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it.each([[null], [undefined], ["plain string"], [{ kind: "markdown" }], [{ value: 3 }]])(
    "returns an empty excerpt for a malformed stem %j",
    (stem) => {
      expect(stemExcerpt(stem)).toBe("");
    },
  );
});
