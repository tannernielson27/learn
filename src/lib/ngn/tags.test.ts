import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import { itemSchema } from "./schemas";
import {
  CLIENT_NEEDS,
  isClientNeed,
  normalizeTag,
  normalizeTags,
  splitTags,
  TAG_LIMITS,
  tagLimitProblem,
} from "./tags";

describe("the client needs categories", () => {
  it("are the eight NCLEX-RN client needs subcategories, in test plan order", () => {
    expect(CLIENT_NEEDS).toEqual([
      "Management of Care",
      "Safety and Infection Control",
      "Health Promotion and Maintenance",
      "Psychosocial Integrity",
      "Basic Care and Comfort",
      "Pharmacological and Parenteral Therapies",
      "Reduction of Risk Potential",
      "Physiological Adaptation",
    ]);
  });

  it("each fit within the tag length limit", () => {
    for (const need of CLIENT_NEEDS) expect(need.length).toBeLessThanOrEqual(TAG_LIMITS.length);
  });

  it("are recognised only by their exact label", () => {
    expect(isClientNeed("Physiological Adaptation")).toBe(true);
    expect(isClientNeed("physiological adaptation")).toBe(false);
    expect(isClientNeed("sepsis")).toBe(false);
  });
});

describe("normalizeTag", () => {
  it("trims and closes up whitespace", () => {
    expect(normalizeTag("  fluid \t and\n electrolytes ")).toBe("fluid and electrolytes");
  });

  it("lower-cases a topic, so one topic is one filter", () => {
    expect(normalizeTag("Sepsis")).toBe("sepsis");
  });

  it("spells a client needs category the one fixed way, whatever its case or spacing", () => {
    expect(normalizeTag("  physiological   ADAPTATION ")).toBe("Physiological Adaptation");
  });

  it("returns an empty string for blank text", () => {
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("normalizeTags", () => {
  it("drops blanks and duplicates that differ only in case or spacing, keeping first order", () => {
    expect(normalizeTags(["Sepsis", " ", "renal", "SEPSIS", "sepsis ", "Renal"])).toEqual([
      "sepsis",
      "renal",
    ]);
  });

  it("keeps client needs categories in their fixed spelling", () => {
    expect(
      normalizeTags(["physiological adaptation", "sepsis", "Physiological Adaptation"]),
    ).toEqual(["Physiological Adaptation", "sepsis"]);
  });

  it("returns a new array and leaves its input alone", () => {
    const input = ["A"];
    const output = normalizeTags(input);
    expect(output).not.toBe(input);
    expect(input).toEqual(["A"]);
  });
});

describe("splitTags", () => {
  it("separates client needs, in the fixed list's order, from topics, in their own order", () => {
    expect(
      splitTags(["sepsis", "Physiological Adaptation", "cardiac", "Management of Care"]),
    ).toEqual({
      clientNeeds: ["Management of Care", "Physiological Adaptation"],
      topics: ["sepsis", "cardiac"],
    });
  });
});

describe("tagLimitProblem", () => {
  it("is null within the limits", () => {
    expect(tagLimitProblem(["sepsis"])).toBeNull();
    expect(tagLimitProblem([])).toBeNull();
  });

  it("names the count limit", () => {
    const tags = Array.from({ length: TAG_LIMITS.count + 1 }, (_, i) => `t${i}`);
    expect(tagLimitProblem(tags)).toBe(`An item can have at most ${TAG_LIMITS.count} tags.`);
  });

  it("names the length limit", () => {
    expect(tagLimitProblem(["x".repeat(TAG_LIMITS.length + 1)])).toBe(
      `Keep each tag to ${TAG_LIMITS.length} characters or fewer.`,
    );
  });
});

describe("tags in the item schema", () => {
  const base = FIXTURES.multiple_choice.canonical;

  it("are normalized when an item is parsed", () => {
    const parsed = itemSchema.parse({ ...base, tags: [" Sepsis", "sepsis", "management of care"] });
    expect(parsed.tags).toEqual(["sepsis", "Management of Care"]);
  });

  it("default to none", () => {
    const withoutTags = Object.fromEntries(Object.entries(base).filter(([key]) => key !== "tags"));
    expect(itemSchema.parse(withoutTags).tags).toEqual([]);
  });

  it("refuse more than the count limit", () => {
    const tags = Array.from({ length: TAG_LIMITS.count + 1 }, (_, i) => `t${i}`);
    expect(itemSchema.safeParse({ ...base, tags }).success).toBe(false);
  });

  it("refuse a tag longer than the length limit, measured after closing up whitespace", () => {
    const long = "x".repeat(TAG_LIMITS.length + 1);
    expect(itemSchema.safeParse({ ...base, tags: [long] }).success).toBe(false);
    const padded = `   ${"x".repeat(TAG_LIMITS.length)}   `;
    expect(itemSchema.safeParse({ ...base, tags: [padded] }).success).toBe(true);
  });
});
