import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_TIMER, type ItemTimer } from "@/lib/live/timer";
import { Countdown } from "./Countdown";

/**
 * The countdown (#182). Every clock here is the *session's*, handed in as `now`: the device's own
 * clock is set two minutes wrong throughout, so a countdown that read it would be two minutes out.
 */
const SERVER = 1_800_000_000_000;
/** This device's clock: two minutes behind the session's. */
const DEVICE = SERVER - 120_000;

let serverNow = SERVER;
const now = () => serverNow;

function tick(ms: number) {
  act(() => {
    serverNow += ms;
    vi.advanceTimersByTime(ms);
  });
}

const running = (left: number, seconds = 30): ItemTimer => ({
  seconds,
  endsAt: SERVER + left,
  remainingMs: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(DEVICE);
  serverNow = SERVER;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Countdown", () => {
  it("shows nothing when the item has no clock", () => {
    const { container } = render(<Countdown timer={NO_TIMER} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts down on the session's clock, not the device's", () => {
    render(<Countdown timer={running(27_000)} now={now} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:27");
    tick(5_000);
    expect(screen.getByRole("timer")).toHaveTextContent("0:22");
  });

  it("says the time is up at zero, and stops there", () => {
    render(<Countdown timer={running(2_000)} now={now} />);
    tick(10_000);
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(screen.getByTestId("countdown-state")).toHaveTextContent("Time is up");
  });

  it("holds still while the room is paused, and says so", () => {
    const frozen: ItemTimer = { seconds: 30, endsAt: null, remainingMs: 12_000 };
    render(<Countdown timer={frozen} now={now} />);
    tick(60_000);
    expect(screen.getByRole("timer")).toHaveTextContent("0:12");
    expect(screen.getByTestId("countdown-state")).toHaveTextContent("Paused");
  });

  it("tells a screen reader at thirty seconds, ten seconds and zero, and at no other time", () => {
    render(<Countdown timer={running(45_000, 60)} now={now} />);
    const spoken = screen.getByTestId("countdown-announcement");
    expect(spoken).toHaveAttribute("aria-live", "polite");
    expect(spoken).toBeEmptyDOMElement();

    const heard: string[] = [];
    const listen = () => {
      const text = spoken.textContent ?? "";
      if (text !== "" && heard.at(-1) !== text) heard.push(text);
    };
    for (let second = 0; second < 50; second += 1) {
      tick(1_000);
      listen();
    }
    expect(heard).toEqual(["30 seconds left.", "10 seconds left.", "Time is up."]);
  });

  it("keeps the visible clock out of the live region, so it is not read every second", () => {
    render(<Countdown timer={running(20_000)} now={now} />);
    const timer = screen.getByRole("timer");
    // `role="timer"` is `aria-live="off"` by definition; nothing inside it is a live region.
    expect(timer).not.toHaveAttribute("aria-live");
    expect(timer.querySelector("[aria-live]")).toBeNull();
  });

  it("draws the bar with a transform, the one property motion here may use", () => {
    render(<Countdown timer={running(15_000, 30)} now={now} />);
    const bar = screen.getByTestId("countdown-bar");
    expect(bar.style.transform).toBe("scaleX(0.5)");
  });
});
