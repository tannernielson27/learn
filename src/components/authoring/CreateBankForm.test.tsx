import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateBankForm, type BankFormState, type CreateBankFormProps } from "./CreateBankForm";

function setup(result: BankFormState) {
  const action = vi.fn<CreateBankFormProps["action"]>(async () => result);
  render(<CreateBankForm action={action} />);
  return { action, user: userEvent.setup() };
}

describe("CreateBankForm", () => {
  it("asks for a bank name with a labelled field", () => {
    setup({ status: "idle" });
    const field = screen.getByRole("textbox", { name: "Bank name" });
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("maxlength", "120");
    expect(screen.getByRole("button", { name: "Create bank" })).toBeEnabled();
  });

  it("sends the name to the action", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.type(screen.getByRole("textbox", { name: "Bank name" }), "Cardiac");
    await user.click(screen.getByRole("button", { name: "Create bank" }));
    expect(action.mock.calls[0][1].get("name")).toBe("Cardiac");
  });

  it("ties an error to the field, announces it and keeps what was typed", async () => {
    const message = "Give the bank a name of up to 120 characters.";
    const { user } = setup({ status: "error", error: message });
    const field = screen.getByRole("textbox", { name: "Bank name" });
    await user.type(field, "Cardiac");
    await user.click(screen.getByRole("button", { name: "Create bank" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(message);
    expect(field).toHaveValue("Cardiac");
    expect(field).toHaveFocus();
  });
});
