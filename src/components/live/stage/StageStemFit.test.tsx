import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_TIMER } from "@/lib/live/timer";
import { StageQuestion } from "./StageQuestion";
import { StageStemFit, STEM_LONG } from "./StageStemFit";
import { HOLD_BOTTOM_MS, HOLD_TOP_MS, RETURN_EASING, scrollPlan } from "./stageScroll";

/**
 * jsdom lays nothing out, so this gives it a model of the stage: the stem's text takes an area
 * that grows with the square of its font size, the part that gives way is 500px tall, and the
 * stage is 1080px tall (a floor of 36px). Then it drives the loop on fake timers.
 */

const NATURAL = 64;
const BOX = 500;
const STAGE = 1080;
/** The stem's height at its natural size; set per test. */
let natural = 0;
/** How far the options alone overflow the part in #482's layout; set per test. */
let optionsOver = 0;

const isStem = (el: Element) => el.hasAttribute("data-stage-stem");
const isRegion = (el: Element) => el.getAttribute("data-testid") === "stage-stem-region";
const isBox = (el: Element) =>
  el.querySelector(":scope > [data-testid=stage-stem-region]") !== null;
const long = (el: Element) => el.closest(`[${STEM_LONG}]`) !== null;
const sizeOf = (el: HTMLElement) => parseFloat(el.style.fontSize) || NATURAL;
const content = (stem: HTMLElement) => natural * (sizeOf(stem) / NATURAL) ** 2;
const stemIn = (el: Element) => el.querySelector<HTMLElement>("[data-stage-stem]")!;

function height(this: HTMLElement, scroll: boolean): number {
  if (this.hasAttribute("data-stage")) return STAGE;
  if (isStem(this)) {
    const all = content(this);
    // #482's clamp: three lines, until the stem is long.
    if (!scroll && this.classList.contains("line-clamp-3") && !long(this)) {
      return Math.min(all, 3 * sizeOf(this) * 1.25);
    }
    return all;
  }
  if (isRegion(this)) return long(this) ? 300 : content(stemIn(this));
  if (isBox(this)) {
    if (!scroll) return BOX;
    return Math.max(BOX, content(stemIn(this)), long(this) ? BOX : BOX + optionsOver);
  }
  return 0;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return height.call(this, false);
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return height.call(this, true);
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    if (el instanceof HTMLElement && isStem(el)) {
      const size = sizeOf(el);
      return { fontSize: `${size}px`, lineHeight: `${size * 1.25}px` } as CSSStyleDeclaration;
    }
    if (el === document.documentElement) return { fontSize: "16px" } as CSSStyleDeclaration;
    return real(el);
  });
  vi.useFakeTimers({
    toFake: [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
      "setTimeout",
      "clearTimeout",
    ],
  });
});

afterEach(() => {
  optionsOver = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  // @ts-expect-error -- jsdom has none; a test that wants reduced motion adds one.
  delete window.matchMedia;
});

function reduceMotion() {
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const STEM = { kind: "markdown" as const, value: "A client reports sudden shortness of breath." };

function draw(clamp = false) {
  return render(
    <div data-stage="">
      <div data-testid="box">
        <StageStemFit stem={STEM} clamp={clamp} />
      </div>
    </div>,
  );
}

const box = () => screen.getByTestId("box");
const stem = () => stemIn(box());
const mover = () => screen.getByTestId("stage-stem-mover");
/** Where the text is headed: the end of the transition running now, or where it rests. */
const offset = () => {
  const match = /translateY\((-?[\d.]+)px\)/.exec(mover().style.transform);
  return match ? 0 - Number(match[1]) || 0 : 0;
};
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("StageStemFit: a question that fits stays as #482 draws it", () => {
  it("leaves a short stem at its own size, unmarked and still", () => {
    natural = 80;
    draw();
    expect(box()).not.toHaveAttribute(STEM_LONG);
    expect(stem().style.fontSize).toBe("");
    expect(screen.queryByTestId("stage-stem-fade-bottom")).toBeNull();
    advance(30_000);
    expect(mover().style.transform).toBe("");
  });

  it("leaves a short stem alone when only the options overflow the part", () => {
    natural = 80;
    optionsOver = 400;
    draw(true);
    expect(box()).not.toHaveAttribute(STEM_LONG);
    expect(stem().style.fontSize).toBe("");
    expect(screen.queryByTestId("stage-stem-fade-bottom")).toBeNull();
    advance(30_000);
    expect(mover().style.transform).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves a crowded question's three-line stem alone when it fits in three lines", () => {
    natural = 160;
    draw(true);
    expect(box()).not.toHaveAttribute(STEM_LONG);
    expect(stem()).toHaveClass("line-clamp-3");
    expect(stem().style.fontSize).toBe("");
  });
});

describe("StageStemFit: fit first", () => {
  it("lifts the clamp for a stem past three lines, even when it fits the long layout as it is", () => {
    natural = 280; // four lines at 64px: cut by the clamp, whole in the 300px a long stem gets
    draw(true);
    expect(box()).toHaveAttribute(STEM_LONG);
    expect(stem().style.fontSize).toBe("64px");
    expect(screen.queryByTestId("stage-stem-fade-bottom")).toBeNull();
  });

  it("steps a long stem down until it fits the room the options leave, and does not move it", () => {
    natural = 400; // fits at about 55px in the 300px a long stem gets
    draw(true);
    expect(box()).toHaveAttribute(STEM_LONG);
    const size = parseFloat(stem().style.fontSize);
    expect(size).toBeLessThan(NATURAL);
    expect(size).toBeGreaterThanOrEqual(36);
    expect(natural * (size / NATURAL) ** 2).toBeLessThanOrEqual(301);
    expect(screen.queryByTestId("stage-stem-fade-bottom")).toBeNull();
    advance(30_000);
    expect(mover().style.transform).toBe("");
  });
});

describe("StageStemFit: scroll only at the floor", () => {
  // At the 36px floor the stem is 632.8px tall in a 300px region: 333px are hidden.
  const plan = () => scrollPlan(333, 45)!;
  beforeEach(() => {
    natural = 2000;
  });

  const transition = () => mover().style.transition;

  it("stops at the floor and holds at the top for 6 s, the bottom faded, with no motion", () => {
    draw(true);
    expect(stem().style.fontSize).toBe("36px");
    expect(mover().style.willChange).toBe("transform");
    advance(HOLD_TOP_MS - 50);
    expect(offset()).toBe(0);
    expect(transition()).toBe("");
    expect(screen.getByTestId("stage-stem-fade-bottom").style.opacity).toBe("1");
    expect(screen.getByTestId("stage-stem-fade-top").style.opacity).toBe("0");
  });

  it("holds on one timer, not a frame loop", () => {
    const frames = vi.spyOn(window, "requestAnimationFrame");
    draw(true);
    advance(HOLD_TOP_MS - 50);
    expect(frames).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("reads down in one linear transition at the steady pace, both edges faded", () => {
    draw(true);
    advance(HOLD_TOP_MS + 10);
    expect(offset()).toBe(333);
    expect(transition()).toBe(`transform ${plan().downMs}ms linear`);
    expect(screen.getByTestId("stage-stem-fade-top").style.opacity).toBe("1");
    expect(screen.getByTestId("stage-stem-fade-bottom").style.opacity).toBe("1");
  });

  it("holds at the bottom with nothing hidden below, then glides back eased and repeats", () => {
    draw(true);
    advance(HOLD_TOP_MS + plan().downMs + HOLD_BOTTOM_MS / 2);
    expect(offset()).toBe(333);
    expect(screen.getByTestId("stage-stem-fade-bottom").style.opacity).toBe("0");
    advance(HOLD_BOTTOM_MS / 2 + 10);
    expect(offset()).toBe(0);
    expect(transition()).toBe(`transform ${plan().returnMs}ms ${RETURN_EASING}`);
    expect(screen.getByTestId("stage-stem-fade-bottom").style.opacity).toBe("1");
    advance(plan().returnMs);
    expect(screen.getByTestId("stage-stem-fade-top").style.opacity).toBe("0");
    advance(HOLD_TOP_MS - 50);
    expect(offset()).toBe(0);
    advance(100);
    expect(offset()).toBe(333);
  });

  it("moves by transform only and stops when the question leaves", () => {
    const { unmount } = draw(true);
    advance(HOLD_TOP_MS + 1_000);
    expect(mover().style.transform).toMatch(/^translateY\(/);
    expect(mover().getAttribute("style")).not.toMatch(/top|margin|height/);
    const moved = mover();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(moved.style.willChange).toBe("");
    expect(moved.style.transform).toBe("");
  });

  it("does not move under reduced motion: clipped at the floor, faded, and says so", () => {
    reduceMotion();
    draw(true);
    expect(stem().style.fontSize).toBe("36px");
    advance(60_000);
    expect(mover().style.transform).toBe("");
    expect(mover().style.willChange).toBe("");
    expect(screen.getByText("Full question on your phone.")).toBeInTheDocument();
    expect(screen.getByTestId("stage-stem-fade-bottom").style.opacity).toBe("1");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not say so when the stem moves", () => {
    draw(true);
    expect(screen.queryByText("Full question on your phone.")).toBeNull();
  });
});

describe("StageQuestion: each new question starts from the top", () => {
  const props = (
    position: number,
    value: string,
    responded = 4,
    labels = ["Raise the head of the bed", "Give oxygen"],
  ) => ({
    place: { position, itemCount: 20, label: `Question ${position} of 20`, caseStep: null },
    answers: { responded, present: 70 },
    timer: NO_TIMER,
    question: {
      stem: { kind: "markdown" as const, value },
      options: labels.map((label, index) => ({
        letter: String.fromCharCode(65 + index),
        label,
      })),
    },
    casePlace: null,
    paused: false,
    url: "learn-nclex.app/join",
    code: "AJ4K7P",
    serverNow: () => 0,
  });

  it("restarts the loop, and the hold, when the room moves on", () => {
    natural = 2000;
    const { rerender } = render(
      <div data-stage="">
        <StageQuestion {...props(3, "A long stem. ".repeat(40))} />
      </div>,
    );
    advance(HOLD_TOP_MS + 3_000);
    expect(offset()).toBeGreaterThan(0);
    rerender(
      <div data-stage="">
        <StageQuestion {...props(4, "Another long stem. ".repeat(40))} />
      </div>,
    );
    expect(offset()).toBe(0);
    advance(HOLD_TOP_MS - 100);
    expect(offset()).toBe(0);
    advance(1_000);
    expect(offset()).toBeGreaterThan(0);
  });

  it("keeps the loop going while the answer count ticks", () => {
    natural = 2000;
    const stemText = "A long stem. ".repeat(40);
    const { rerender } = render(
      <div data-stage="">
        <StageQuestion {...props(3, stemText, 0)} />
      </div>,
    );
    const moving = mover();
    advance(HOLD_TOP_MS + 500);
    const headed = offset();
    expect(headed).toBeGreaterThan(0);
    for (let count = 1; count <= 20; count += 1) {
      rerender(
        <div data-stage="">
          <StageQuestion {...props(3, stemText, count)} />
        </div>,
      );
      advance(100);
    }
    expect(mover()).toBe(moving);
    expect(offset()).toBe(headed);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("measures again when the same stem's clamp changes", () => {
    natural = 280; // past three lines when clamped, whole when not
    const stemText = "A four-line stem.";
    const { rerender } = render(
      <div data-stage="">
        <StageQuestion {...props(3, stemText, 4, ["A", "B"])} />
      </div>,
    );
    const part = () => mover().closest("[data-stage] div.flex-1")!;
    expect(part()).not.toHaveAttribute(STEM_LONG);
    rerender(
      <div data-stage="">
        <StageQuestion {...props(3, stemText, 4, ["A", "B", "C", "D", "E"])} />
      </div>,
    );
    expect(part()).toHaveAttribute(STEM_LONG);
  });
});
