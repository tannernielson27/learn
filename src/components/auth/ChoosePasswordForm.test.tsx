import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ChoosePasswordForm,
  type ChoosePasswordFormProps,
  type ChoosePasswordState,
} from "./ChoosePasswordForm";

function setup(result: ChoosePasswordState) {
  const action = vi.fn<ChoosePasswordFormProps["action"]>(async () => result);
  render(<ChoosePasswordForm action={action} email="a@school.edu" next="/learn" />);
  return { action, user: userEvent.setup() };
}

describe("ChoosePasswordForm", () => {
  it("asks once for a new password, with the rule beside it and a way to skip", () => {
    setup({ status: "idle" });
    const field = screen.getByLabelText("New password");
    expect(field).toHaveAttribute("autocomplete", "new-password");
    expect(field).toHaveAccessibleDescription("At least 8 characters.");
    expect(screen.getByRole("link", { name: "Not now" })).toHaveAttribute("href", "/learn");
  });

  it("offers no way to skip when the earlier password has just been retired", () => {
    const action = vi.fn<ChoosePasswordFormProps["action"]>(async () => ({ status: "idle" }));
    render(
      <ChoosePasswordForm action={action} email="a@school.edu" next="/learn" skippable={false} />,
    );
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Not now" })).toBeNull();
  });

  it("sends the password to the action, then says it is saved and where to go", async () => {
    const { action, user } = setup({ status: "saved" });
    await user.type(screen.getByLabelText("New password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(action.mock.calls[0]![1].get("password")).toBe("correct horse");
    expect(await screen.findByRole("heading", { name: "Password saved" })).toHaveFocus();
    expect(screen.getByText(/a@school\.edu/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/learn");
  });

  it("ties a refusal to the field and announces it", async () => {
    const message = "Use at least 8 characters for your password.";
    const { user } = setup({ status: "error", error: message });
    await user.type(screen.getByLabelText("New password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    const field = screen.getByLabelText("New password");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(`At least 8 characters. ${message}`);
    expect(field).toHaveFocus();
  });
});
