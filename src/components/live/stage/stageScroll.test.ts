import { describe, expect, it } from "vitest";
import {
  HOLD_BOTTOM_MS,
  HOLD_TOP_MS,
  fitStemSize,
  scrollAt,
  scrollPlan,
  scrollSpeed,
  stemFloor,
} from "./stageScroll";

describe("stemFloor: the smallest stem the back row still reads", () => {
  it("is 28px on a 720px stage and a thirtieth of the height above that", () => {
    expect(stemFloor(720, 16)).toBe(28);
    expect(stemFloor(1080, 16)).toBe(36);
    expect(stemFloor(2160, 16)).toBe(72);
  });

  it("follows the root size, so zoom keeps the floor in step with the stage ladder", () => {
    expect(stemFloor(720, 20)).toBe(35);
  });
});

describe("fitStemSize: step the stem down until it fits, never under the floor", () => {
  it("keeps the natural size when the stem already fits", () => {
    const tried: number[] = [];
    const fit = fitStemSize(64, 36, (size) => (tried.push(size), true));
    expect(fit).toEqual({ size: 64, fits: true });
    expect(tried).toEqual([64]);
  });

  it("stops at the first step that fits, each step smaller than the last", () => {
    const tried: number[] = [];
    const fit = fitStemSize(64, 36, (size) => (tried.push(size), size <= 50));
    expect(fit.fits).toBe(true);
    expect(fit.size).toBeLessThanOrEqual(50);
    expect(fit.size).toBeGreaterThan(50 * 0.9);
    for (let i = 1; i < tried.length; i += 1) expect(tried[i]).toBeLessThan(tried[i - 1]!);
  });

  it("ends at the floor, not fitting, when nothing fits", () => {
    const tried: number[] = [];
    const fit = fitStemSize(64, 36, (size) => (tried.push(size), false));
    expect(fit).toEqual({ size: 36, fits: false });
    expect(tried.at(-1)).toBe(36);
    expect(Math.min(...tried)).toBe(36);
    // A handful of steps, not a pixel at a time.
    expect(tried.length).toBeLessThan(15);
  });

  it("never grows a stem already under the floor", () => {
    expect(fitStemSize(28, 36, () => false)).toEqual({ size: 28, fits: false });
  });
});

describe("scrollSpeed: a reading pace scaled to the line", () => {
  it("is between 25 and 40 px/s", () => {
    expect(scrollSpeed(20)).toBe(25);
    expect(scrollSpeed(45)).toBeCloseTo(31.5);
    expect(scrollSpeed(200)).toBe(40);
  });
});

describe("scrollPlan and scrollAt: hold, read down, hold, glide back, repeat", () => {
  const plan = scrollPlan(300, 45)!;

  it("has no plan when nothing is hidden", () => {
    expect(scrollPlan(0, 45)).toBeNull();
    expect(scrollPlan(-4, 45)).toBeNull();
  });

  it("holds at the top for 6 s and at the bottom for 4 s", () => {
    expect(plan.holdTopMs).toBe(HOLD_TOP_MS);
    expect(HOLD_TOP_MS).toBe(6_000);
    expect(plan.holdBottomMs).toBe(HOLD_BOTTOM_MS);
    expect(HOLD_BOTTOM_MS).toBe(4_000);
    expect(scrollAt(plan, 0)).toEqual({ offset: 0, phase: "holdTop" });
    expect(scrollAt(plan, 5_999).offset).toBe(0);
  });

  it("reads down at the plan's speed", () => {
    expect(plan.downMs).toBeCloseTo((300 / plan.speed) * 1000);
    const halfway = scrollAt(plan, HOLD_TOP_MS + plan.downMs / 2);
    expect(halfway.phase).toBe("down");
    expect(halfway.offset).toBeCloseTo(150);
  });

  it("holds at the bottom, the whole distance down", () => {
    const at = scrollAt(plan, HOLD_TOP_MS + plan.downMs + 1);
    expect(at.phase).toBe("holdBottom");
    expect(at.offset).toBe(300);
  });

  it("glides back to the top, eased, faster than it read down", () => {
    expect(plan.returnMs).toBeLessThan(plan.downMs);
    expect(plan.returnMs).toBeGreaterThanOrEqual(1_200);
    const start = HOLD_TOP_MS + plan.downMs + HOLD_BOTTOM_MS;
    const midway = scrollAt(plan, start + plan.returnMs / 2);
    expect(midway.phase).toBe("return");
    expect(midway.offset).toBeCloseTo(150);
    // Eased: a tenth of the way in it has moved less than a tenth of the distance.
    expect(scrollAt(plan, start + plan.returnMs / 10).offset).toBeGreaterThan(270);
  });

  it("repeats, from the top, once the cycle is done", () => {
    expect(plan.cycleMs).toBe(HOLD_TOP_MS + plan.downMs + HOLD_BOTTOM_MS + plan.returnMs);
    expect(scrollAt(plan, plan.cycleMs)).toEqual({ offset: 0, phase: "holdTop" });
    expect(scrollAt(plan, plan.cycleMs * 3 + HOLD_TOP_MS + plan.downMs / 2).offset).toBeCloseTo(
      150,
    );
  });

  it("treats a clock that runs backwards as the start", () => {
    expect(scrollAt(plan, -50)).toEqual({ offset: 0, phase: "holdTop" });
  });

  it("caps the glide back for a very long text", () => {
    expect(scrollPlan(5_000, 45)!.returnMs).toBe(2_500);
  });
});
