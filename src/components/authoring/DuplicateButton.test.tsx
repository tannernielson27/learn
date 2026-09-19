import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DuplicateButton, type DuplicateButtonProps, type DuplicateState } from "./DuplicateButton";

function setup(result: DuplicateState, label = "Duplicate item") {
  const action = vi.fn<DuplicateButtonProps["action"]>(async () => result);
  render(<DuplicateButton action={action} label={label} />);
  return { action, user: userEvent.setup() };
}

describe("DuplicateButton", () => {
  it("duplicates with one button named for what it copies", async () => {
    const { action, user } = setup({ status: "idle" }, "Duplicate case study");
    await user.click(screen.getByRole("button", { name: "Duplicate case study" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("works from the keyboard", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.tab();
    expect(screen.getByRole("button", { name: "Duplicate item" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("says why a copy was not made, and focuses the message", async () => {
    const message = "The item could not be duplicated. Try again.";
    const { user } = setup({ status: "error", error: message });
    await user.click(screen.getByRole("button", { name: "Duplicate item" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
  });

  it("shows no message before it is used", () => {
    setup({ status: "idle" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
