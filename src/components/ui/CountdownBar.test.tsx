import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countdownReading } from "@/lib/live/countdown";
import { NO_TIMER, type ItemTimer } from "@/lib/live/timer";
import { CountdownBar, CountdownBarView, WARN_WORDS } from "./CountdownBar";

const SERVER = 1_800_000_000_000;
let serverNow = SERVER;
const now = () => serverNow;

const running = (left: number, seconds = 30): ItemTimer => ({
  seconds,
  endsAt: SERVER + left,
  remainingMs: null,
});

function tick(ms: number) {
  act(() => {
    serverNow += ms;
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // The device's clock is two minutes off; the bar must follow the session's.
  vi.setSystemTime(SERVER - 120_000);
  serverNow = SERVER;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CountdownBarView", () => {
  it("shows the time as text beside an accent bar", () => {
    render(<CountdownBarView reading={countdownReading(21_000, 30_000)} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:21");
    const fill = screen.getByTestId("countdown-fill");
    expect(fill).toHaveClass("bg-accent", "transition-transform", "motion-reduce:transition-none");
    expect(fill.style.transform).toBe("scaleX(0.7)");
    expect(screen.queryByText(WARN_WORDS)).toBeNull();
  });

  it("turns amber and says so in words in the last ten seconds, without a pulse", () => {
    render(<CountdownBarView reading={countdownReading(8_000, 30_000)} size="stage" />);
    expect(screen.getByTestId("countdown-fill")).toHaveClass("bg-flag");
    expect(screen.getByRole("timer")).toHaveClass("text-flag-ink", "text-stage-label");
    expect(screen.getByText("10 seconds left")).toHaveClass("text-flag-ink");
    expect(screen.getByTestId("countdown-bar").innerHTML).not.toMatch(/animate-|pulse/);
  });
});

describe("CountdownBar", () => {
  it("draws nothing for an item with no clock", () => {
    const { container } = render(<CountdownBar timer={NO_TIMER} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts down on the session's clock and warns as it reads 0:10", () => {
    render(<CountdownBar timer={running(12_000)} now={now} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:12");
    expect(screen.queryByText(WARN_WORDS)).toBeNull();
    tick(2_000);
    expect(screen.getByRole("timer")).toHaveTextContent("0:10");
    expect(screen.getByText(WARN_WORDS)).toBeInTheDocument();
    tick(20_000);
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(screen.queryByText(WARN_WORDS)).toBeNull();
  });

  it("announces three moments politely, and nothing while paused", () => {
    const { rerender, container } = render(<CountdownBar timer={running(9_000)} now={now} />);
    const spoken = container.querySelector("[aria-live]")!;
    expect(spoken).toHaveTextContent("10 seconds left.");
    rerender(<CountdownBar timer={{ seconds: 30, endsAt: null, remainingMs: 9_000 }} now={now} />);
    expect(container.querySelector("[aria-live]")).toBeEmptyDOMElement();
  });
});
