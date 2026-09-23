import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmSubmit } from "./ConfirmSubmit";

function setup() {
  const action = vi.fn(async () => {});
  render(
    <ConfirmSubmit
      action={action}
      label="New link"
      confirmLabel="Replace the link"
      warning="The old link stops working."
    />,
  );
  return { action, user: userEvent.setup() };
}

describe("ConfirmSubmit", () => {
  it("asks before doing anything", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "New link" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("The old link stops working.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("does it once confirmed", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "New link" }));
    await user.click(screen.getByRole("button", { name: "Replace the link" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("can be called off, returning focus to the first button", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "New link" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New link" })).toHaveFocus();
  });
});
