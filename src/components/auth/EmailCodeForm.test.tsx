import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailCodeForm, type EmailCodeFormProps, type EmailCodeState } from "./EmailCodeForm";

function setup(result: EmailCodeState = { status: "idle" }) {
  const action = vi.fn<EmailCodeFormProps["action"]>(async () => result);
  render(<EmailCodeForm action={action} email="nurse@school.edu" next="/c/tok" />);
  return { action };
}

describe("EmailCodeForm (#306)", () => {
  it("asks for the code with a field phones fill from the email", () => {
    setup();
    const field = screen.getByRole("textbox", { name: "Code from the email" });
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByText(/opened the email on another device/i)).toBeInTheDocument();
  });

  it("posts the code with the address it was sent to and where to go after", async () => {
    const { action } = setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Code from the email" }), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with the code" }));
    const posted = action.mock.calls[0]![1];
    expect(posted.get("code")).toBe("123456");
    expect(posted.get("email")).toBe("nurse@school.edu");
    expect(posted.get("next")).toBe("/c/tok");
  });

  it("shows a refusal as an alert tied to the field, and focuses the field", async () => {
    setup({ status: "error", error: "That code did not work." });
    const field = screen.getByRole("textbox", { name: "Code from the email" });
    await userEvent.type(field, "000000");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with the code" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That code did not work.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("That code did not work.");
    expect(field).toHaveFocus();
  });
});
