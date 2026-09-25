import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignInForm, type SignInFormProps, type SignInState } from "./SignInForm";

const LINK_ERROR =
  "That sign-in link has expired or was already used. Enter your email to get a new one.";

function setup(result: SignInState, props: { next?: string; linkError?: boolean } = {}) {
  const action = vi.fn<SignInFormProps["action"]>(async () => result);
  render(<SignInForm action={action} next={props.next ?? "/author"} linkError={props.linkError} />);
  return { action, user: userEvent.setup() };
}

describe("SignInForm", () => {
  it("asks for an email with a labelled field and a clear button", () => {
    setup({ status: "idle" });
    const field = screen.getByRole("textbox", { name: "Email address" });
    expect(field).toHaveAttribute("type", "email");
    expect(field).toHaveAttribute("autocomplete", "email");
    expect(field).toBeRequired();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  });

  it("sends the email and the next path to the action", async () => {
    const { action, user } = setup(
      { status: "sent", email: "a@example.test" },
      { next: "/author/banks/1" },
    );
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@example.test");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    const data = action.mock.calls[0][1];
    expect(data.get("email")).toBe("a@example.test");
    expect(data.get("next")).toBe("/author/banks/1");
  });

  it("says where the link went, and lets the person use another address", async () => {
    const { user } = setup({ status: "sent", email: "a@example.test" });
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@example.test");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(/a@example\.test/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveFocus();
  });

  it("ties an error to the field and announces it", async () => {
    const message = "Enter the email address you use for LeaRN, like name@school.edu.";
    const { user } = setup({ status: "error", error: message });
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "nope@x");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    const field = screen.getByRole("textbox", { name: "Email address" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(message);
    expect(field).toHaveFocus();
  });

  it("explains a used or expired link on arrival", () => {
    setup({ status: "idle" }, { linkError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(LINK_ERROR);
    // #267: the form to send a new one is right there, ready to use.
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAccessibleDescription(
      LINK_ERROR,
    );
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  });
});
