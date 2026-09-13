import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItemList } from "./ItemList";

const items = [
  {
    id: "i1",
    type: "multiple_response",
    status: "draft" as const,
    stemExcerpt: "Which findings need follow-up?",
    updatedAt: "2026-09-12T15:00:00Z",
  },
  {
    id: "i2",
    type: "matrix_multiple_choice",
    status: "published" as const,
    stemExcerpt: "",
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
    const second = screen.getByRole("link", { name: /Untitled item/ });
    expect(within(second).getByText("Matrix Multiple Choice")).toBeInTheDocument();
    expect(within(second).getByText("Published")).toBeInTheDocument();
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
});
