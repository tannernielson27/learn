import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BankList } from "./BankList";

const banks = [
  { id: "b1", name: "Cardiac", itemCount: 12, updatedAt: "2026-09-12T15:00:00Z" },
  { id: "b2", name: "Respiratory", itemCount: 1, updatedAt: "2026-09-10T09:30:00Z" },
];

describe("BankList", () => {
  it("links each bank by name, with its size and last edit", () => {
    render(<BankList banks={banks} />);
    const cardiac = screen.getByRole("link", { name: /Cardiac/ });
    expect(cardiac).toHaveAttribute("href", "/author/banks/b1");
    expect(within(cardiac).getByText("12 items")).toBeInTheDocument();
    expect(within(cardiac).getByText("Edited Sep 12, 2026")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Respiratory/ })).getByText("1 item"),
    ).toBeInTheDocument();
  });

  it("lists banks in a named list", () => {
    render(<BankList banks={banks} />);
    expect(
      within(screen.getByRole("list", { name: "Item banks" })).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  it("says what to do when there are no banks", () => {
    render(<BankList banks={[]} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByText("No item banks yet. Create one to start writing items."),
    ).toBeInTheDocument();
  });
});
