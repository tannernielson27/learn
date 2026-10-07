import { afterEach, describe, expect, it } from "vitest";
import { lockScroll } from "./scrollLock";

const overflow = () => document.documentElement.style.overflow;

afterEach(() => {
  document.documentElement.style.overflow = "";
});

describe("lockScroll", () => {
  it("locks the page and puts back the value it found", () => {
    document.documentElement.style.overflow = "clip";
    const release = lockScroll();
    expect(overflow()).toBe("hidden");
    release();
    expect(overflow()).toBe("clip");
  });

  it("holds until the last holder lets go, whatever the order", () => {
    const first = lockScroll();
    const second = lockScroll();
    first();
    expect(overflow()).toBe("hidden");
    second();
    expect(overflow()).toBe("");
  });

  it("counts a release once, however often it is called", () => {
    const first = lockScroll();
    const second = lockScroll();
    first();
    first();
    expect(overflow()).toBe("hidden");
    second();
    expect(overflow()).toBe("");
  });
});
