import { describe, expect, it } from "vitest";
import { parseCaseStudyTitle } from "./caseStudyForm";

const form = (title?: string | Blob) => {
  const data = new FormData();
  if (title !== undefined) data.set("title", title);
  return data;
};

describe("parseCaseStudyTitle", () => {
  it("trims the title", () => {
    expect(parseCaseStudyTitle(form("  Post-operative day two  "))).toEqual({
      ok: true,
      title: "Post-operative day two",
    });
  });

  it.each([[""], ["   "], [undefined]])("asks for a title when it is empty: %j", (title) => {
    expect(parseCaseStudyTitle(form(title))).toEqual({
      ok: false,
      error: "Give the case study a title.",
    });
  });

  it("accepts exactly 200 characters, the table's limit, and refuses 201", () => {
    expect(parseCaseStudyTitle(form("x".repeat(200)))).toEqual({
      ok: true,
      title: "x".repeat(200),
    });
    expect(parseCaseStudyTitle(form("x".repeat(201)))).toEqual({
      ok: false,
      error: "Keep the title to 200 characters or fewer.",
    });
  });

  it("refuses a file sent in place of the title", () => {
    expect(parseCaseStudyTitle(form(new Blob(["Sepsis"])))).toEqual({
      ok: false,
      error: "Give the case study a title.",
    });
  });
});
