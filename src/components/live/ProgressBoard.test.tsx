import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionProgress } from "@/lib/live";
import { ProgressBoard } from "./ProgressBoard";

const BOARD: SessionProgress = {
  answered: [2, 0, 1],
  rows: [
    { participantId: "p1", displayName: "Ada", positions: [1, 3] },
    { participantId: "p2", displayName: "Grace", positions: [1] },
  ],
};

describe("ProgressBoard (#185)", () => {
  it("draws everyone against every item, answered or not, with the counts beneath", async () => {
    render(<ProgressBoard ask={async () => BOARD} itemCount={3} active intervalMs={1_000} />);
    const ada = await screen.findByRole("row", { name: /Ada/ });
    const cells = within(ada).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["Answered", "Not yet", "Answered"]);
    expect(within(screen.getByRole("row", { name: /Grace/ })).getAllByRole("cell")).toHaveLength(3);
    expect(screen.getByTestId("answered-count-1")).toHaveTextContent("2 of 2");
    expect(screen.getByTestId("answered-count-2")).toHaveTextContent("0 of 2");
    expect(screen.getByTestId("answered-count-3")).toHaveTextContent("1 of 2");
    expect(screen.getByRole("columnheader", { name: "Item 2" })).toBeInTheDocument();
  });

  it("never says right or wrong", async () => {
    render(<ProgressBoard ask={async () => BOARD} itemCount={3} active intervalMs={1_000} />);
    await screen.findByRole("row", { name: /Ada/ });
    const board = screen.getByTestId("progress-board");
    expect(board.textContent).not.toMatch(/correct|incorrect|right|wrong|points|score/i);
  });

  it("asks again on the tally's cadence, and fills in as answers arrive", async () => {
    let now: SessionProgress = { answered: [0, 0], rows: [BOARD.rows[0]!] };
    const ask = vi.fn(async () => now);
    render(<ProgressBoard ask={ask} itemCount={2} active intervalMs={20} />);
    await waitFor(() => expect(screen.getByTestId("answered-count-1")).toHaveTextContent("0 of 1"));
    now = { answered: [1, 0], rows: [{ ...BOARD.rows[0]!, positions: [1] }] };
    await waitFor(() => expect(screen.getByTestId("answered-count-1")).toHaveTextContent("1 of 1"));
    expect(ask.mock.calls.length).toBeGreaterThan(1);
  });

  it("says so when nobody has joined, and asks for nothing when the room is not open", async () => {
    const { unmount } = render(
      <ProgressBoard
        ask={async () => ({ answered: [0], rows: [] })}
        itemCount={1}
        active
        intervalMs={1_000}
      />,
    );
    expect(await screen.findByText("Nobody has joined yet.")).toBeInTheDocument();
    unmount();

    const ask = vi.fn(async () => BOARD);
    render(<ProgressBoard ask={ask} itemCount={3} active={false} intervalMs={20} />);
    expect(screen.queryByRole("heading", { name: "Progress" })).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it("keeps the grid in a region a keyboard can scroll", async () => {
    render(<ProgressBoard ask={async () => BOARD} itemCount={3} active intervalMs={1_000} />);
    const region = await screen.findByRole("region", { name: "Progress grid" });
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
