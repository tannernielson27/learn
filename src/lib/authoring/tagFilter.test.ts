import { describe, expect, it } from "vitest";
import { TAG_LIMITS } from "@/lib/ngn/tags";
import {
  bankViewHref,
  isFiltering,
  NO_FILTER,
  parseTagFilter,
  tagFacets,
  tagLabels,
  toggleStep,
  toggleTag,
  withoutTags,
  type TaggedRow,
} from "./tagFilter";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("parseTagFilter", () => {
  it("reads no filter from nothing", () => {
    expect(parseTagFilter(undefined, undefined)).toEqual(NO_FILTER);
  });

  it("reads one tag or several, normalized and without repeats", () => {
    expect(parseTagFilter("Sepsis", undefined)).toEqual({ tags: ["sepsis"], step: null });
    expect(
      parseTagFilter(["physiological adaptation", "sepsis", "SEPSIS", " "], undefined),
    ).toEqual({ tags: ["Physiological Adaptation", "sepsis"], step: null });
  });

  it("reads a CJMM step from 1 to 6, and ignores anything else", () => {
    expect(parseTagFilter(undefined, "3").step).toBe(3);
    expect(parseTagFilter(undefined, "7").step).toBeNull();
    expect(parseTagFilter(undefined, "2.5").step).toBeNull();
    expect(parseTagFilter(undefined, ["2", "3"]).step).toBe(2);
    expect(parseTagFilter(undefined, "x").step).toBeNull();
  });

  it("drops tags past the limits, so a long URL costs no more than a short one", () => {
    const many = Array.from({ length: TAG_LIMITS.count + 5 }, (_, i) => `t${i}`);
    expect(parseTagFilter(many, undefined).tags).toHaveLength(TAG_LIMITS.count);
    expect(parseTagFilter(["x".repeat(TAG_LIMITS.length + 1), "ok"], undefined).tags).toEqual([
      "ok",
    ]);
  });
});

describe("isFiltering", () => {
  it("is true with a tag or a step", () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ tags: ["sepsis"], step: null })).toBe(true);
    expect(isFiltering({ tags: [], step: 2 })).toBe(true);
  });
});

describe("toggleTag and toggleStep", () => {
  it("add a tag, or take it away when it is already chosen", () => {
    const one = toggleTag(NO_FILTER, "sepsis");
    expect(one).toEqual({ tags: ["sepsis"], step: null });
    expect(toggleTag(one, "cardiac").tags).toEqual(["sepsis", "cardiac"]);
    expect(toggleTag(one, "sepsis")).toEqual(NO_FILTER);
    expect(NO_FILTER.tags).toEqual([]);
  });

  it("choose one step at a time", () => {
    expect(toggleStep(NO_FILTER, 2).step).toBe(2);
    expect(toggleStep({ tags: [], step: 2 }, 5).step).toBe(5);
    expect(toggleStep({ tags: [], step: 2 }, 2).step).toBeNull();
  });

  it("keep whatever else the filter holds, such as a search", () => {
    const searching = { tags: [], step: null, query: "lactate", type: null, status: "draft" };
    expect(toggleTag(searching, "sepsis")).toEqual({ ...searching, tags: ["sepsis"] });
    expect(toggleStep(searching, 1)).toEqual({ ...searching, step: 1 });
  });
});

describe("withoutTags", () => {
  it("clears the tags and step and keeps the rest", () => {
    const filter = { tags: ["sepsis"], step: 2 as const, query: "lactate" };
    expect(withoutTags(filter)).toEqual({ tags: [], step: null, query: "lactate" });
  });
});

describe("bankViewHref", () => {
  it("is the bank itself with no folder and no filter", () => {
    expect(bankViewHref(BANK, { kind: "all" }, NO_FILTER)).toBe(`/author/banks/${BANK}`);
  });

  it("keeps the folder and every tag and the step, encoded", () => {
    expect(
      bankViewHref(
        BANK,
        { kind: "folder", id: FOLDER },
        { tags: ["Physiological Adaptation", "sepsis"], step: 3 },
      ),
    ).toBe(`/author/banks/${BANK}?folder=${FOLDER}&tag=Physiological+Adaptation&tag=sepsis&step=3`);
    expect(bankViewHref(BANK, { kind: "unfiled" }, { tags: ["a&b"], step: null })).toBe(
      `/author/banks/${BANK}?folder=unfiled&tag=a%26b`,
    );
  });

  it("keeps a search, its type and status, and a page past the first", () => {
    expect(
      bankViewHref(
        BANK,
        { kind: "unfiled" },
        {
          tags: ["sepsis"],
          step: null,
          query: "serum lactate",
          type: "matrix_multiple_choice",
          status: "published",
        },
        3,
      ),
    ).toBe(
      `/author/banks/${BANK}?folder=unfiled&tag=sepsis&q=serum+lactate&type=matrix_multiple_choice&status=published&page=3`,
    );
    expect(bankViewHref(BANK, { kind: "all" }, { ...NO_FILTER, query: "" }, 1)).toBe(
      `/author/banks/${BANK}`,
    );
  });
});

describe("tagLabels", () => {
  it("reads the CJMM step as the first tag, then client needs in fixed order, then topics", () => {
    expect(tagLabels(2, ["sepsis", "Physiological Adaptation", "Management of Care"])).toEqual([
      "Step 2: Analyze Cues",
      "Management of Care",
      "Physiological Adaptation",
      "sepsis",
    ]);
  });

  it("leaves out a missing or unknown step", () => {
    expect(tagLabels(null, ["sepsis"])).toEqual(["sepsis"]);
    expect(tagLabels(9, [])).toEqual([]);
  });
});

describe("tagFacets", () => {
  const rows: TaggedRow[] = [
    { tags: ["Physiological Adaptation", "sepsis"], cjmmStep: 1 },
    { tags: ["Physiological Adaptation", "sepsis", "renal"], cjmmStep: 3 },
    { tags: ["Physiological Adaptation"], cjmmStep: null },
    { tags: ["sepsis", "Management of Care"], cjmmStep: 3 },
    { tags: [], cjmmStep: null },
  ];

  it("counts every tag and step across the view with no filter", () => {
    const facets = tagFacets(rows, NO_FILTER);
    expect(facets.matching).toBe(5);
    expect(facets.steps).toEqual([
      { step: 1, label: "Step 1: Recognize Cues", count: 1, selected: false },
      { step: 3, label: "Step 3: Prioritize Hypotheses", count: 2, selected: false },
    ]);
    // Client needs in the fixed order, topics by count and then name.
    expect(facets.clientNeeds).toEqual([
      { tag: "Management of Care", count: 1, selected: false },
      { tag: "Physiological Adaptation", count: 3, selected: false },
    ]);
    expect(facets.topics).toEqual([
      { tag: "sepsis", count: 3, selected: false },
      { tag: "renal", count: 1, selected: false },
    ]);
  });

  it("counts what each further tag would leave, combining tags with AND", () => {
    const facets = tagFacets(rows, { tags: ["Physiological Adaptation"], step: null });
    expect(facets.matching).toBe(3);
    expect(facets.clientNeeds).toEqual([
      { tag: "Physiological Adaptation", count: 3, selected: true },
    ]);
    expect(facets.topics).toEqual([
      { tag: "sepsis", count: 2, selected: false },
      { tag: "renal", count: 1, selected: false },
    ]);
  });

  it("keeps a chosen tag no item carries, with a count of none, so it can be removed", () => {
    const facets = tagFacets(rows, { tags: ["cardiac"], step: null });
    expect(facets.matching).toBe(0);
    expect(facets.topics).toEqual([{ tag: "cardiac", count: 0, selected: true }]);
  });

  it("counts other steps as a swap, since an item has one step", () => {
    const facets = tagFacets(rows, { tags: ["sepsis"], step: 1 });
    expect(facets.matching).toBe(1);
    expect(facets.steps).toEqual([
      { step: 1, label: "Step 1: Recognize Cues", count: 1, selected: true },
      { step: 3, label: "Step 3: Prioritize Hypotheses", count: 2, selected: false },
    ]);
  });
});
