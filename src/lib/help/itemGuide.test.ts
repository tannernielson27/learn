import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import {
  CJMM_GUIDE,
  COMPOSITE_GUIDE,
  HELP_FIGURES,
  ITEM_GUIDE,
  MODEL_NAMES,
  helpSectionId,
} from "./itemGuide";

const STEPS = Object.keys(CJMM_STEP_LABELS).map(Number) as CjmmStep[];

/** Width and height from a PNG's IHDR chunk, which always starts at byte 16. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("ITEM_GUIDE", () => {
  // #269: a new item type cannot ship without a help entry.
  it.each(ITEM_TYPES)("has a complete entry for %s", (type) => {
    const entry = ITEM_GUIDE[type];
    expect(entry, `add ${type} to ITEM_GUIDE in src/lib/help/itemGuide.ts`).toBeDefined();
    expect(entry.tests.trim()).not.toBe("");
    expect(entry.scoring.trim()).not.toBe("");
    expect(entry.tip.trim()).not.toBe("");
  });

  it("has no entry for a type the app does not have", () => {
    expect(Object.keys(ITEM_GUIDE).sort()).toEqual([...ITEM_TYPES].sort());
  });

  // The guide names each type's scoring model; the fixtures carry the model the engine uses.
  it.each(ITEM_TYPES)("names the scoring model %s's fixture uses", (type) => {
    expect(ITEM_GUIDE[type].model).toBe(FIXTURES[type].canonical.scoring.model);
  });

  // ...and the sentence a reader sees opens with that same model's name.
  it.each(ITEM_TYPES)("opens %s's scoring sentence with its model's name", (type) => {
    const entry = ITEM_GUIDE[type];
    expect(entry.scoring.startsWith(MODEL_NAMES[entry.model])).toBe(true);
  });

  it("gives every section a distinct anchor", () => {
    const ids = [
      ...ITEM_TYPES.map(helpSectionId),
      ...COMPOSITE_GUIDE.map((entry) => entry.id),
      ...STEPS.map((step) => `step-${step}`),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(helpSectionId("dropdown_rationale")).toBe("dropdown-rationale");
  });
});

describe("COMPOSITE_GUIDE", () => {
  it("covers the case study and the Trend item", () => {
    expect(COMPOSITE_GUIDE.map((entry) => entry.title)).toEqual(["Case study", "Trend item"]);
    for (const entry of COMPOSITE_GUIDE) {
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.scoring.trim()).not.toBe("");
    }
  });
});

describe("CJMM_GUIDE", () => {
  it.each(STEPS)("says what step %i asks of the student", (step) => {
    expect(CJMM_GUIDE[step].asks.trim()).not.toBe("");
    expect(CJMM_GUIDE[step].formats.trim()).not.toBe("");
  });
});

describe("HELP_FIGURES", () => {
  const root = process.cwd();

  it.each(Object.entries(HELP_FIGURES))(
    "%s is a byte-for-byte copy of a committed baseline, with its real size and alt text",
    (_name, figure) => {
      const published = readFileSync(path.join(root, "public", figure.src));
      const baseline = readFileSync(path.join(root, "e2e", "__screenshots__", figure.baseline));
      expect(published.equals(baseline)).toBe(true);
      expect(pngSize(published)).toEqual({ width: figure.width, height: figure.height });
      expect(figure.alt.trim().length).toBeGreaterThan(20);
    },
  );

  // Decision 6 (#269): no help page gives an item's key away, so no revealed or feedback capture.
  it("uses no capture that shows a key", () => {
    for (const figure of Object.values(HELP_FIGURES)) {
      expect(figure.baseline).not.toMatch(/revealed|feedback|case-study-results/);
    }
  });
});
