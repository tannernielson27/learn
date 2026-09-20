import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArchiveButton, type ArchiveButtonProps, type ArchiveState } from "./ArchiveButton";

function setup(result: ArchiveState, props: Partial<ArchiveButtonProps> = {}) {
  const action = vi.fn<ArchiveButtonProps["action"]>(async () => result);
  render(<ArchiveButton action={action} label="Archive item" {...props} />);
  return { action, user: userEvent.setup() };
}

describe("ArchiveButton", () => {
  it("archives with one button named for what it does", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.click(screen.getByRole("button", { name: "Archive item" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("can carry a longer name for a list, where the item it acts on must be said", () => {
    setup({ status: "idle" }, { label: "Restore", accessibleName: "Restore Which comes first?" });
    expect(screen.getByRole("button", { name: "Restore Which comes first?" })).toHaveTextContent(
      "Restore",
    );
  });

  it("works from the keyboard", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.tab();
    expect(screen.getByRole("button", { name: "Archive item" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("says why it could not, and focuses the message", async () => {
    const message = 'This item is step 3 of the case study "Heart failure".';
    const { user } = setup({ status: "error", error: message });
    await user.click(screen.getByRole("button", { name: "Archive item" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
  });

  it("shows no message before it is used", () => {
    setup({ status: "idle" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
