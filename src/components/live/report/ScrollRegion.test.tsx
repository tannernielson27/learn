import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollRegion } from "./ScrollRegion";
import { STICKY_EDGE } from "./stickyEdge";

/** jsdom lays nothing out, so each test says how wide the box and its table are. */
function sized(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

const renderRegion = () =>
  render(
    <ScrollRegion label="Scores by student">
      <table>
        <tbody>
          <tr>
            <th scope="row" className={STICKY_EDGE}>
              Ava
            </th>
            <td>1</td>
          </tr>
        </tbody>
      </table>
    </ScrollRegion>,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScrollRegion", () => {
  it("is a named region a keyboard can reach and scroll", () => {
    sized(300, 300);
    renderRegion();
    const region = screen.getByRole("region", { name: "Scores by student" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-x-auto", "focus-visible:outline-accent");
  });

  it("shows no cue on a table that fits", () => {
    sized(300, 300);
    renderRegion();
    const frame = screen.getByRole("region").parentElement as HTMLElement;
    expect(frame).not.toHaveAttribute("data-more");
    expect(frame).not.toHaveAttribute("data-scrolled");
  });

  it("fades the right edge while columns wait past it, and draws the sticky line once scrolled", () => {
    sized(900, 300);
    renderRegion();
    const region = screen.getByRole("region");
    const frame = region.parentElement as HTMLElement;
    expect(frame).toHaveAttribute("data-more");
    expect(frame).not.toHaveAttribute("data-scrolled");

    // Part way: both cues.
    act(() => {
      region.scrollLeft = 200;
      fireEvent.scroll(region);
    });
    expect(frame).toHaveAttribute("data-more");
    expect(frame).toHaveAttribute("data-scrolled");

    // At the end: nothing more to the right.
    act(() => {
      region.scrollLeft = 600;
      fireEvent.scroll(region);
    });
    expect(frame).not.toHaveAttribute("data-more");
    expect(frame).toHaveAttribute("data-scrolled");
  });

  it("draws the cue as an opacity change, hidden from screen readers, that never takes a tap", () => {
    sized(900, 300);
    const { container } = renderRegion();
    const cue = container.querySelector("[data-scroll-cue]") as HTMLElement;
    expect(cue).toHaveAttribute("aria-hidden", "true");
    expect(cue).toHaveClass(
      "pointer-events-none",
      "opacity-0",
      "transition-opacity",
      "motion-reduce:transition-none",
      "group-data-more/scroll:opacity-100",
    );
  });

  it("keeps the sticky column sticky, on the surface the rows scroll under", () => {
    expect(STICKY_EDGE.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "left-0", "bg-surface-1"]),
    );
  });
});
