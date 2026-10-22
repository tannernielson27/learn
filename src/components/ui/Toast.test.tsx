import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_MS, Toast } from "./Toast";

describe("Toast", () => {
  const shown = vi.fn();
  const hidden = vi.fn();
  let open = false;

  beforeEach(() => {
    vi.useFakeTimers();
    open = false;
    // jsdom has no popover API; stand in for the browser's.
    HTMLElement.prototype.showPopover = function () {
      open = true;
      shown();
    };
    HTMLElement.prototype.hidePopover = function () {
      open = false;
      hidden();
    };
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, query) {
      return query === ":popover-open" ? open : matches.call(this, query);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    shown.mockReset();
    hidden.mockReset();
  });

  it("says its message once, politely, and shows it in the top layer", () => {
    render(<Toast message="Saved" onDismiss={() => {}} />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Saved");
    const card = screen.getByTestId("toast");
    expect(card).toHaveAttribute("popover", "manual");
    expect(card).toHaveAttribute("aria-hidden", "true");
    expect(card).toHaveClass("motion-toast", "shadow-elevation-1");
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it("asks to be dismissed after its time, with the latest callback", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Toast message="Copied" onDismiss={first} />);
    rerender(<Toast message="Copied" onDismiss={latest} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("hides when the message clears, and shows nothing with no message", () => {
    const { rerender } = render(<Toast message="Reconnected" onDismiss={() => {}} duration={50} />);
    rerender(<Toast message={null} onDismiss={() => {}} />);
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("still speaks in a browser without popovers", () => {
    // @ts-expect-error: a browser from before the popover API
    delete HTMLElement.prototype.showPopover;
    render(<Toast message="Saved" onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
