import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayOnce } from "./PlayOnce";

type Callback = (entries: Array<Pick<IntersectionObserverEntry, "isIntersecting">>) => void;

const observers: Array<{ callback: Callback; disconnect: ReturnType<typeof vi.fn> }> = [];

class FakeObserver {
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  constructor(callback: Callback) {
    observers.push({ callback, disconnect: this.disconnect });
  }
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const frame = () => screen.getByTestId("live-class-play");

// #563: the landing page's live session plays once when seen, and never under reduced motion.
describe("PlayOnce", () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is the last frame on the server, with nothing held back", () => {
    const html = renderToStaticMarkup(
      <PlayOnce>
        <span data-demo-step="">18</span>
      </PlayOnce>,
    );
    expect(html).not.toContain("data-demo=");
    expect(html).toContain(">18<");
  });

  it("holds its steps until seen, then plays them once and stops watching", () => {
    setReducedMotion(false);
    render(<PlayOnce>drawing</PlayOnce>);
    expect(frame()).toHaveAttribute("data-demo", "ready");

    act(() => observers[0]?.callback([{ isIntersecting: false }]));
    expect(frame()).toHaveAttribute("data-demo", "ready");

    act(() => observers[0]?.callback([{ isIntersecting: true }]));
    expect(frame()).toHaveAttribute("data-demo", "play");
    expect(observers[0]?.disconnect).toHaveBeenCalled();
    expect(observers).toHaveLength(1);
  });

  it("shows the last frame and watches nothing under reduced motion", () => {
    setReducedMotion(true);
    render(
      <PlayOnce>
        <span data-demo-step="">18</span>
      </PlayOnce>,
    );
    expect(frame()).not.toHaveAttribute("data-demo");
    expect(observers).toHaveLength(0);
    expect(screen.getByText("18")).toBeVisible();
  });

  it("shows the last frame in a browser with no IntersectionObserver", () => {
    setReducedMotion(false);
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<PlayOnce>drawing</PlayOnce>);
    expect(frame()).not.toHaveAttribute("data-demo");
  });

  it("goes back to the last frame if it leaves before it was seen", () => {
    setReducedMotion(false);
    const { unmount } = render(<PlayOnce>drawing</PlayOnce>);
    const element = frame();
    unmount();
    expect(element).not.toHaveAttribute("data-demo");
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });
});
