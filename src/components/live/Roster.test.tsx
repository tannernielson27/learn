import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RosterEntry } from "@/lib/live";
import { createPresentCount, RoomCount } from "./RoomCount";
import { Roster } from "./Roster";

const entry = (n: number, present = true): RosterEntry => ({
  participantId: `p${n}`,
  displayName: `Student ${n}`,
  joinedAt: n,
  present,
});

const settling = (testId: string, motion: string) =>
  screen.getByTestId(testId).querySelector(`[data-motion="${motion}"]`);

describe("Roster: the present count settles when it changes", () => {
  it("settles the number in, and reduced motion turns the animation off", () => {
    render(<Roster roster={[entry(1), entry(2)]} />);

    expect(screen.getByTestId("present-count")).toHaveTextContent(/^2 phones connected$/);
    expect(settling("present-count", "present-count")).toHaveClass(
      "motion-settle",
      "inline-block",
      "motion-reduce:animate-none",
    );
  });

  it("remounts only the number when it changes, never the rows", () => {
    const { rerender } = render(<Roster roster={[entry(1), entry(2)]} />);
    const number = settling("present-count", "present-count");
    const rows = screen.getAllByRole("listitem");

    rerender(<Roster roster={[entry(1), entry(2), entry(3)]} />);

    const after = settling("present-count", "present-count");
    expect(after).toHaveTextContent(/^3$/);
    expect(after).not.toBe(number);
    const rowsAfter = screen.getAllByRole("listitem");
    expect(rowsAfter).toHaveLength(3);
    // The rows already there keep their mount, so their own entrance does not replay.
    expect(rowsAfter[0]).toBe(rows[0]);
    expect(rowsAfter[1]).toBe(rows[1]);
  });

  it("keeps the number's mount when a sync leaves the count alone", () => {
    const { rerender } = render(<Roster roster={[entry(1), entry(2)]} />);
    const number = settling("present-count", "present-count");

    // One phone goes away as another joins: the count is the same, so nothing replays.
    rerender(<Roster roster={[entry(1, false), entry(2), entry(3)]} />);

    expect(settling("present-count", "present-count")).toBe(number);
  });
});

describe("RoomCount: the waiting-screen count settles when it changes", () => {
  it("settles the number in, and only the number remounts", () => {
    const present = createPresentCount();
    render(<RoomCount present={present} />);
    const line = screen.getByTestId("room-count");
    const number = settling("room-count", "room-count");
    expect(line).toHaveTextContent(/^1 in this session$/);
    expect(number).toHaveClass("motion-settle", "inline-block", "motion-reduce:animate-none");

    act(() => present.set(4));

    expect(screen.getByTestId("room-count")).toBe(line);
    const after = settling("room-count", "room-count");
    expect(after).toHaveTextContent(/^4$/);
    expect(after).not.toBe(number);
  });
});
