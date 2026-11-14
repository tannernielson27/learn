import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveClassDemo } from "./LiveClassDemo";

type Callback = (entries: { isIntersecting: boolean }[]) => void;

/** An IntersectionObserver the test drives by hand, counting what it observes. */
function fakeObserver() {
  const state = { callback: null as Callback | null, observed: 0, disconnected: 0 };
  class Fake {
    constructor(callback: Callback) {
      state.callback = callback;
    }
    observe() {
      state.observed += 1;
    }
    disconnect() {
      state.disconnected += 1;
    }
  }
  vi.stubGlobal("IntersectionObserver", Fake);
  return state;
}

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

const motion = () =>
  screen.getByRole("figure", { name: /A live session in class/ }).querySelector("[data-motion]");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the landing picture's motion (#563)", () => {
  it("under reduced motion draws the last frame at once and watches nothing", () => {
    preferReducedMotion(true);
    const observer = fakeObserver();
    render(<LiveClassDemo />);
    expect(motion()).toHaveAttribute("data-motion", "still");
    expect(observer.observed).toBe(0);
    // The last frame: every phone, the choices and the count are in the page.
    expect(screen.getByTestId("answer-count")).toHaveTextContent("18 of 24 answered");
  });

  it("waits until it is seen, then plays once and stops watching", () => {
    preferReducedMotion(false);
    const observer = fakeObserver();
    render(<LiveClassDemo />);
    expect(motion()).toHaveAttribute("data-motion", "waiting");
    expect(observer.observed).toBe(1);

    act(() => observer.callback?.([{ isIntersecting: false }]));
    expect(motion()).toHaveAttribute("data-motion", "waiting");

    act(() => observer.callback?.([{ isIntersecting: true }]));
    expect(motion()).toHaveAttribute("data-motion", "played");
    expect(observer.disconnected).toBeGreaterThan(0);
  });

  it("shows the last frame in a browser that cannot watch for it", () => {
    preferReducedMotion(false);
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<LiveClassDemo />);
    expect(motion()).toHaveAttribute("data-motion", "still");
  });

  it("moves only transform and opacity, and the first frame is hidden only for a script", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf(".demo-rise,"));
    for (const [, property] of block.matchAll(/transition:\s*([^;]+);/g)) {
      for (const part of property.split(",")) {
        expect(part.trim()).toMatch(/^(opacity|transform|none)\b/);
      }
    }
    expect(block).toMatch(
      /@media \(scripting: enabled\) and \(prefers-reduced-motion: no-preference\)/,
    );
    expect(block).not.toMatch(/infinite|animation-iteration-count/);
  });
});
