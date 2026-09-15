import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItemList } from "./ItemList";

const items = [
  {
    id: "i1",
    type: "multiple_response",
    status: "draft" as const,
    stemExcerpt: "Which findings need follow-up?",
    maxPoints: 3,
    updatedAt: "2026-09-12T15:00:00Z",
  },
  {
    id: "i2",
    type: "matrix_multiple_choice",
    status: "published" as const,
    stemExcerpt: "",
    maxPoints: null,
    updatedAt: "2026-09-11T08:00:00Z",
  },
];

describe("ItemList", () => {
  it("links each item to its editor by stem, with type, status and last edit", () => {
    render(<ItemList items={items} />);
    const first = screen.getByRole("link", { name: /Which findings need follow-up\?/ });
    expect(first).toHaveAttribute("href", "/author/items/i1");
    expect(within(first).getByText("Extended Multiple Response")).toBeInTheDocument();
    expect(within(first).getByText("Draft")).toBeInTheDocument();
    expect(within(first).getByText("Edited Sep 12, 2026")).toBeInTheDocument();
  });

  it("names an item with no stem yet", () => {
    render(<ItemList items={items} />);
    // Anchored: the published item's Play link is named "Play Untitled item".
    const second = screen.getByRole("link", { name: /^Untitled item/ });
    expect(within(second).getByText("Matrix Multiple Choice")).toBeInTheDocument();
    expect(within(second).getByText("Published")).toBeInTheDocument();
  });

  it("offers Play for a published item only, named for the item", () => {
    render(<ItemList items={items} />);
    expect(screen.getByRole("link", { name: "Play Untitled item" })).toHaveAttribute(
      "href",
      "/author/items/i2/play",
    );
    expect(screen.queryByRole("link", { name: /^Play Which findings/ })).not.toBeInTheDocument();
  });

  it("shows each item's points, and none while scoring is not set", () => {
    render(<ItemList items={[...items, { ...items[0], id: "i3", maxPoints: 1 }]} />);
    const [first, , third] = screen.getAllByRole("link", { name: /^(Which findings|Untitled)/ });
    expect(within(first).getByText("3 points")).toBeInTheDocument();
    expect(within(third).getByText("1 point")).toBeInTheDocument();
    const untitled = screen.getByRole("link", { name: /^Untitled item/ });
    expect(within(untitled).queryByText(/point/)).not.toBeInTheDocument();
  });

  it("falls back to the raw type for an unknown one rather than crashing", () => {
    render(<ItemList items={[{ ...items[0], type: "future_type" }]} />);
    expect(screen.getByText("future_type")).toBeInTheDocument();
  });

  it("says what to do when the bank is empty", () => {
    render(<ItemList items={[]} />);
    expect(
      screen.getByText("No items in this bank yet. Choose New item to write one."),
    ).toBeInTheDocument();
  });

  it("says so when a folder holds no items", () => {
    render(<ItemList items={[]} emptyMessage="No items in this folder." />);
    expect(screen.getByText("No items in this folder.")).toBeInTheDocument();
  });

  it("offers no selection unless there is a move form to join", () => {
    render(<ItemList items={items} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("lets each item be selected for a move, outside its link, named for the item", () => {
    render(<ItemList items={items} moveFormId="move-form" />);
    const first = screen.getByRole("checkbox", { name: "Select Which findings need follow-up?" });
    expect(first).toHaveAttribute("form", "move-form");
    expect(first).toHaveAttribute("name", "item");
    expect(first).toHaveAttribute("value", "i1");
    expect(first.closest("a")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select Untitled item" })).toHaveAttribute(
      "value",
      "i2",
    );
  });
});
