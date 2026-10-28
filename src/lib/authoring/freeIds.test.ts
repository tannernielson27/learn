import { describe, expect, it } from "vitest";
import { nextOptionId, unusedId } from "./freeIds";

describe("unusedId", () => {
  it("takes the lowest free number after the prefix", () => {
    expect(unusedId("row", new Set())).toBe("row1");
    expect(unusedId("row", new Set(["row1", "row2", "row4"]))).toBe("row3");
  });

  it("falls back to a timestamp once 1 to 99 are all taken", () => {
    const taken = new Set(Array.from({ length: 99 }, (_, i) => `b${i + 1}`));
    expect(unusedId("b", taken)).toMatch(/^b\d{13,}$/);
  });
});

describe("nextOptionId", () => {
  it("takes the first free letter", () => {
    expect(nextOptionId([])).toBe("opt_a");
    expect(nextOptionId([{ id: "opt_a" }, { id: "opt_c" }])).toBe("opt_b");
  });

  it("falls back to a timestamp once a to z are all taken", () => {
    const all = Array.from({ length: 26 }, (_, i) => ({
      id: `opt_${String.fromCharCode(97 + i)}`,
    }));
    expect(nextOptionId(all)).toMatch(/^opt_\d{13,}$/);
  });
});
