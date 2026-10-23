import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JoinScreen } from "./JoinScreen";

vi.mock("./actions", () => ({ joinLiveSession: async () => ({ status: "idle" }) }));

describe("JoinScreen (Main and JoinDesktop mockups)", () => {
  it("names the page, says no account is needed, and asks for the code and a name", () => {
    render(<JoinScreen code="" />);
    expect(screen.getByRole("heading", { level: 1, name: "Join a live session" })).toBeVisible();
    expect(screen.getByText("No account needed.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Join code" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Display name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("says what happens next, in three steps, beside the form on a laptop", () => {
    render(<JoinScreen code="" />);
    const next = screen.getByRole("region", { name: "What happens next" });
    expect(next).toHaveClass("hidden", "lg:flex");
    expect(
      within(next)
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toEqual([
      expect.stringContaining("Wait for your teacher"),
      expect.stringContaining("Answer on this screen"),
      expect.stringContaining("See the answer together"),
    ]);
  });

  it("sends a student holding a class code to the right place", () => {
    render(<JoinScreen code="" />);
    expect(screen.getByRole("link", { name: "Join your class" })).toBeInTheDocument();
    expect(screen.getByText(/Have a class code like ABCD-2345\?/)).toBeInTheDocument();
  });
});
