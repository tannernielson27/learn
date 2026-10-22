import { describe, expect, it } from "vitest";
import { HEIGHT_CLASS_MIN, WIDTH_CLASS_MIN, heightClass, sizeClass, widthClass } from "./sizeClass";

describe("widthClass", () => {
  it("follows the M3 window widths", () => {
    expect(widthClass(375)).toBe("compact");
    expect(widthClass(599)).toBe("compact");
    expect(widthClass(600)).toBe("medium");
    expect(widthClass(839)).toBe("medium");
    expect(widthClass(840)).toBe("expanded");
    expect(widthClass(1199)).toBe("expanded");
    expect(widthClass(1200)).toBe("large");
    expect(widthClass(1599)).toBe("large");
    expect(widthClass(1600)).toBe("extraLarge");
    expect(widthClass(1920)).toBe("extraLarge");
  });

  it("reads a width it cannot measure as compact, the safe layout", () => {
    expect(widthClass(Number.NaN)).toBe("compact");
    expect(widthClass(-1)).toBe("compact");
  });

  it("publishes its thresholds", () => {
    expect(WIDTH_CLASS_MIN).toEqual({
      compact: 0,
      medium: 600,
      expanded: 840,
      large: 1200,
      extraLarge: 1600,
    });
  });
});

describe("heightClass", () => {
  it("follows the M3 window heights", () => {
    expect(heightClass(390)).toBe("compact");
    expect(heightClass(479)).toBe("compact");
    expect(heightClass(480)).toBe("medium");
    expect(heightClass(899)).toBe("medium");
    expect(heightClass(900)).toBe("expanded");
    expect(heightClass(Number.NaN)).toBe("compact");
    expect(HEIGHT_CLASS_MIN).toEqual({ compact: 0, medium: 480, expanded: 900 });
  });
});

describe("sizeClass", () => {
  it("names a landscape phone compact height and a projector extra large", () => {
    expect(sizeClass(844, 390)).toEqual({
      width: "expanded",
      height: "compact",
      compactHeight: true,
    });
    expect(sizeClass(1920, 1080)).toEqual({
      width: "extraLarge",
      height: "expanded",
      compactHeight: false,
    });
    expect(sizeClass(375, 812)).toEqual({
      width: "compact",
      height: "medium",
      compactHeight: false,
    });
  });
});
