import { describe, expect, it } from "vitest";
import { bestFit, fitPlacement, layoutWidths } from "./stageFit";

describe("fitPlacement", () => {
  it("scales a small view up to the cap, centred across the frame", () => {
    expect(fitPlacement({ width: 1800, height: 900 }, { width: 800, height: 300 }, 2)).toEqual({
      scale: 2,
      x: 100,
    });
  });

  it("scales a tall view down until its whole height is on the wall", () => {
    const { scale, x } = fitPlacement(
      { width: 1200, height: 500 },
      { width: 800, height: 1000 },
      2,
    );
    expect(scale).toBe(0.5);
    expect(x).toBe(400);
  });

  it("scales a wide view down until its whole width is on the wall", () => {
    expect(fitPlacement({ width: 600, height: 900 }, { width: 1200, height: 300 }, 1).scale).toBe(
      0.5,
    );
  });

  it("leaves a view alone while nothing is laid out (hidden, or before layout)", () => {
    expect(fitPlacement({ width: 0, height: 0 }, { width: 800, height: 300 }, 2)).toEqual({
      scale: 1,
      x: 0,
    });
    expect(fitPlacement({ width: 1200, height: 600 }, { width: 0, height: 0 }, 2)).toEqual({
      scale: 1,
      x: 0,
    });
  });
});

describe("layoutWidths", () => {
  it("tries from the floor up to the frame's width on a small wall", () => {
    expect(layoutWidths(1173, 2, 768)).toEqual([768, 903, 1038, 1173]);
  });

  it("starts at what the frame holds at the cap on a big wall", () => {
    expect(layoutWidths(1760, 2, 768)).toEqual([880, 1173, 1467, 1760]);
  });

  it("offers one width when the frame is no wider than the floor", () => {
    expect(layoutWidths(600, 2, 768)).toEqual([768]);
  });
});

describe("bestFit", () => {
  const frame = { width: 1200, height: 480 };

  it("lays a tall view out wider when that draws it bigger", () => {
    // Text rewraps: the wider the layout, the shorter the view.
    const measure = (width: number) => ({ width, height: 400_000 / width });
    const fit = bestFit(frame, [800, 1000, 1200], 2, measure);
    expect(fit.width).toBe(1000);
    expect(fit.scale).toBeCloseTo(1.2);
  });

  it("keeps the narrowest layout when every width draws it the same", () => {
    const fit = bestFit(frame, [400, 600], 1, () => ({ width: 300, height: 200 }));
    expect(fit).toEqual({ scale: 1, x: 450, width: 400 });
  });

  it("leaves the view alone with no width to try", () => {
    expect(bestFit(frame, [], 2, () => ({ width: 1, height: 1 }))).toEqual({
      scale: 1,
      x: 0,
      width: 0,
    });
  });
});
