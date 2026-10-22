import { describe, expect, it } from "vitest";
import {
  ARCHIVE_ONE,
  archiveConfirmTitle,
  archiveSummary,
  parseArchiveOne,
  parseArchiveSelection,
  stepRefusal,
} from "./archiveSelection";

const ITEM = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const CASE = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a02";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("parseArchiveSelection", () => {
  it("reads the selected questions and case studies, once each", () => {
    expect(
      parseArchiveSelection(
        form([
          ["item", ITEM],
          ["item", ITEM],
          ["caseStudy", CASE],
        ]),
      ),
    ).toEqual({ ok: true, itemIds: [ITEM], caseStudyIds: [CASE] });
  });

  it("asks for a selection in archive's words", () => {
    expect(parseArchiveSelection(form([]))).toEqual({
      ok: false,
      error: "Select at least one question or case study to archive.",
    });
  });

  it("refuses more than the limit before reading any id", () => {
    const many = form(Array.from({ length: 201 }, () => ["item", "x"] as [string, string]));
    expect(parseArchiveSelection(many)).toEqual({
      ok: false,
      error: "Archive at most 200 at a time.",
    });
  });

  it("refuses an id that is not one", () => {
    expect(parseArchiveSelection(form([["item", "nope"]]))).toMatchObject({ ok: false });
  });

  it("archives only the one row when a row's own Archive sent the form", () => {
    expect(
      parseArchiveSelection(
        form([
          ["item", ITEM],
          [ARCHIVE_ONE, `caseStudy:${CASE}`],
        ]),
      ),
    ).toEqual({ ok: true, itemIds: [], caseStudyIds: [CASE] });
  });
});

describe("parseArchiveOne", () => {
  it("reads a row's kind and id", () => {
    expect(parseArchiveOne(`item:${ITEM}`)).toEqual({ kind: "item", id: ITEM });
    expect(parseArchiveOne(`caseStudy:${CASE}`)).toEqual({ kind: "caseStudy", id: CASE });
  });

  it("reads nothing else", () => {
    expect(parseArchiveOne(null)).toBeNull();
    expect(parseArchiveOne(`quiz:${ITEM}`)).toBeNull();
    expect(parseArchiveOne("item:nope")).toBeNull();
  });
});

describe("the words", () => {
  it("names how many in the confirm", () => {
    expect(archiveConfirmTitle({ items: 2, caseStudies: 1 })).toBe(
      "Archive 2 questions and 1 case study?",
    );
    expect(archiveConfirmTitle({ items: 1, caseStudies: 0 })).toBe("Archive 1 question?");
  });

  it("says what was archived", () => {
    expect(archiveSummary({ items: 2, caseStudies: 0 })).toBe("Archived 2 questions.");
    expect(archiveSummary({ items: 0, caseStudies: 0 })).toBe("Nothing was archived.");
  });

  it("names the question and its case study when a step is refused", () => {
    expect(stepRefusal("Which finding", "Mr. Lee", 2)).toBe(
      '"Which finding" is step 2 of the case study "Mr. Lee", so it stays. Archive the case study instead, or give that step another question first.',
    );
    expect(stepRefusal("", "Mr. Lee", 2)).toMatch(/^An untitled question is step 2/);
  });
});
