import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewItemChooser, type NewItemChooserProps } from "./NewItemChooser";

describe("NewItemChooser", () => {
  it("creates an item of the chosen type", async () => {
    const create = vi.fn<NewItemChooserProps["create"]>(async () => ({ error: "" }));
    render(<NewItemChooser create={create} />);
    await userEvent.click(screen.getByRole("button", { name: /Matrix Multiple Choice/ }));
    expect(create).toHaveBeenCalledWith("matrix_multiple_choice");
  });

  it("announces a failure and lets the person try again", async () => {
    const create = vi
      .fn<NewItemChooserProps["create"]>()
      .mockResolvedValueOnce({ error: "The item could not be created. Try again." })
      .mockResolvedValueOnce({ error: "" });
    render(<NewItemChooser create={create} />);
    const choice = screen.getByRole("button", { name: "Multiple Choice" });
    await userEvent.click(choice);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The item could not be created. Try again.",
    );
    expect(choice).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Multiple Choice/ }));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("ignores further choices while one is being created", async () => {
    let finish: (value: { error: string }) => void = () => {};
    const create = vi.fn<NewItemChooserProps["create"]>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<NewItemChooser create={create} />);
    await userEvent.click(screen.getByRole("button", { name: /^Multiple Choice/ }));
    await userEvent.click(screen.getByRole("button", { name: /Matrix Multiple Choice/ }));
    expect(create).toHaveBeenCalledTimes(1);
    finish({ error: "" });
  });
});
