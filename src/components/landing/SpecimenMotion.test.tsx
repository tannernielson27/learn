import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveClassSpecimen } from "./LiveClassSpecimen";

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observed: { callback: Callback; disconnect: ReturnType<typeof vi.fn> } | null = null;

class FakeObserver {
  disconnect = vi.fn();
  constructor(callback: Callback) {
    observed = { callback, disconnect: this.disconnect };
  }
  observe() {}
}

function stubScreen({ reduce, top }: { reduce: boolean; top: number }) {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: reduce && query.includes("reduce") })),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
  } as DOMRect);
}

const state = () => document.querySelector("[data-specimen]")?.getAttribute("data-specimen");

afterEach(() => {
  observed = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// #563: the specimen plays once when scrolled into view, and never under reduced motion.
describe("the live session specimen's motion", () => {
  it("draws the finished picture under reduced motion and never arms", () => {
    stubScreen({ reduce: true, top: 5000 });
    render(<LiveClassSpecimen />);
    expect(state()).toBe("still");
    expect(observed).toBeNull();
    expect(screen.getByRole("img")).toHaveTextContent("18 of 24 answered");
    expect(screen.getByRole("img")).toHaveTextContent("Answer sent");
  });

  it("leaves the finished picture when it is already on screen as the page arrives", () => {
    stubScreen({ reduce: false, top: 100 });
    render(<LiveClassSpecimen />);
    expect(state()).toBe("still");
    expect(observed).toBeNull();
  });

  it("waits below the fold, then plays once when scrolled into view", () => {
    stubScreen({ reduce: false, top: 5000 });
    render(<LiveClassSpecimen />);
    expect(state()).toBe("armed");
    act(() => observed?.callback([{ isIntersecting: false }]));
    expect(state()).toBe("armed");
    act(() => observed?.callback([{ isIntersecting: true }]));
    expect(state()).toBe("playing");
    expect(observed?.disconnect).toHaveBeenCalled();
  });

  it("moves only parts marked as cues, each starting within two seconds", () => {
    stubScreen({ reduce: false, top: 5000 });
    render(<LiveClassSpecimen />);
    const cues = [...document.querySelectorAll<HTMLElement>("[data-cue]")];
    expect(cues.length).toBeGreaterThan(5);
    for (const cue of cues) {
      expect(Number.parseInt(cue.style.getPropertyValue("--cue-at"), 10)).toBeLessThanOrEqual(2100);
    }
  });
});
