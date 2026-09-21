import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { RENDERED_TYPES, hasRenderer } from "./rendered";
import { RENDERERS } from "./registry";
import { RULES } from "./rules";

describe("the renderer registry", () => {
  it("lists exactly the types that have a renderer, so the nav's list cannot drift (#54)", () => {
    expect([...RENDERED_TYPES].sort()).toEqual(Object.keys(RENDERERS).sort());
  });

  it("answers hasRenderer from the plain list", () => {
    for (const type of ITEM_TYPES) expect(hasRenderer(type)).toBe(type in RENDERERS);
  });

  it("gives every renderer its synchronous rules alongside the lazy component", () => {
    for (const type of RENDERED_TYPES) {
      const entry = RENDERERS[type];
      expect(entry?.Renderer).toBeDefined();
      expect(entry?.isComplete).toBe(RULES[type].isComplete);
      expect(entry?.explainScore).toBe(RULES[type].explainScore);
    }
  });
});
