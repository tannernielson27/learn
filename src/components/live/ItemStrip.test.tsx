import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NO_TIMER, type ItemAggregate, type LiveSessionState } from "@/lib/live";
import { ItemStrip, type ItemStripProps } from "./ItemStrip";

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 4,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

const tallyOf = (position: number, responded: number): ItemAggregate => ({
  itemId: `item-${position}`,
  position,
  present: 5,
  responded,
  fullMarks: responded,
  partialMarks: 0,
  noMarks: 0,
  meanPoints: 1,
  maxPoints: 1,
});

function setup(over: Partial<ItemStripProps> = {}) {
  const onGoto = vi.fn();
  const props: ItemStripProps = { state: state(), tally: null, busy: false, onGoto, ...over };
  const view = render(<ItemStrip {...props} />);
  return {
    onGoto,
    user: userEvent.setup(),
    rerender: (next: Partial<ItemStripProps>) => view.rerender(<ItemStrip {...props} {...next} />),
  };
}

const goButton = (position: number) =>
  screen.getByRole("button", { name: `Go to item ${position}` });

describe("ItemStrip (#183)", () => {
  it("offers every item in the set, and marks the one the room is on", () => {
    setup({ state: state({ position: 2 }) });
    const nav = screen.getByRole("navigation", { name: "Items" });
    expect(nav).toBeInTheDocument();
    for (const position of [1, 2, 3, 4]) expect(goButton(position)).toBeInTheDocument();
    expect(goButton(2)).toHaveAttribute("aria-current", "step");
    expect(goButton(2)).toBeDisabled();
    expect(goButton(1)).not.toHaveAttribute("aria-current");
    expect(goButton(1)).toBeEnabled();
  });

  it("jumps to the item chosen, forwards or back, from the keyboard too", async () => {
    const { user, onGoto } = setup({ state: state({ position: 2 }) });
    await user.click(goButton(4));
    expect(onGoto).toHaveBeenLastCalledWith(4);
    goButton(1).focus();
    await user.keyboard("{Enter}");
    expect(onGoto).toHaveBeenLastCalledWith(1);
  });

  it("offers nothing while a move is in flight", () => {
    setup({ busy: true });
    expect(goButton(3)).toBeDisabled();
  });

  it("is not there in the lobby or once the session has ended", () => {
    const { rerender } = setup({ state: state({ status: "lobby", position: null }) });
    expect(screen.queryByRole("navigation", { name: "Items" })).toBeNull();
    rerender({ state: state({ status: "ended" }) });
    expect(screen.queryByRole("navigation", { name: "Items" })).toBeNull();
  });

  it("keeps the answered count it has heard for each item, and which were shown", () => {
    const { rerender } = setup({ state: state({ position: 1 }), tally: tallyOf(1, 3) });
    expect(goButton(1)).toHaveAccessibleDescription("On now. 3 answered.");

    rerender({ state: state({ position: 1, reveal: true }), tally: tallyOf(1, 3) });
    rerender({ state: state({ position: 2 }), tally: tallyOf(2, 0) });
    expect(goButton(1)).toHaveAccessibleDescription("3 answered. Answer shown.");
    expect(goButton(2)).toHaveAccessibleDescription("On now. 0 answered.");
    // An item this console has heard nothing about says nothing, rather than a made-up zero.
    expect(goButton(3)).not.toHaveAccessibleDescription(/answered/);
  });
});
