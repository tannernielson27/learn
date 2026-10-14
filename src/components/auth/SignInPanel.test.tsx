import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PasswordSignInState } from "./PasswordSignInForm";
import { SignInPanel, type SignInPanelProps } from "./SignInPanel";

function setup(
  props: Partial<Pick<SignInPanelProps, "next" | "linkError">> = {},
  passwordResult: PasswordSignInState = { status: "idle" },
) {
  const passwordAction = vi.fn<SignInPanelProps["passwordAction"]>(async () => passwordResult);
  const linkAction = vi.fn<SignInPanelProps["linkAction"]>(async (_state, data) => ({
    status: "sent",
    email: String(data.get("email")),
  }));
  const codeAction = vi.fn<SignInPanelProps["codeAction"]>(async () => ({ status: "idle" }));
  render(
    <SignInPanel
      passwordAction={passwordAction}
      linkAction={linkAction}
      codeAction={codeAction}
      next={props.next ?? "/author"}
      linkError={props.linkError}
    />,
  );
  return { passwordAction, linkAction, user: userEvent.setup() };
}

describe("SignInPanel", () => {
  it("opens on email and password, labelled for a password manager", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute(
      "autocomplete",
      "username",
    );
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("sends the email, password and next path to the password action", async () => {
    const { passwordAction, user } = setup({ next: "/learn" });
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@school.edu");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const data = passwordAction.mock.calls[0]![1];
    expect(data.get("email")).toBe("a@school.edu");
    expect(data.get("password")).toBe("correct horse");
    expect(data.get("next")).toBe("/learn");
  });

  it("shows the password on request, and hides it again", async () => {
    const { user } = setup();
    const password = screen.getByLabelText("Password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("announces a wrong password on the password field, and keeps the email", async () => {
    const message = "That email and password do not match.";
    const { user } = setup({}, { status: "error", error: message, field: "password" });
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@school.edu");
    await user.type(screen.getByLabelText("Password"), "wrong horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(message);
    expect(password).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue("a@school.edu");
  });

  it("puts a malformed address's error on the email field", async () => {
    const message = "Enter the email address you use for LeaRN, like name@school.edu.";
    const { user } = setup({}, { status: "error", error: message, field: "email" });
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@b");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("alert");
    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveAccessibleDescription(message);
    expect(email).toHaveFocus();
  });

  it("switches to the emailed link carrying the address, and back again", async () => {
    const { linkAction, user } = setup({ next: "/learn" });
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@school.edu");
    await user.click(screen.getByRole("button", { name: "Sign in with an emailed link instead" }));

    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveValue("a@school.edu");
    expect(email).toHaveFocus();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(linkAction.mock.calls[0]![1].get("next")).toBe("/learn");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in with your password instead" }));
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue("a@school.edu");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("sends a forgotten password through the link to choosing a new one, then on to next", async () => {
    const { linkAction, user } = setup({ next: "/learn" });
    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(screen.getByText(/Then you can choose a new password/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@school.edu");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(linkAction.mock.calls[0]![1].get("next")).toBe("/account/password?next=%2Flearn");
  });

  it("starts at the link form after a failed link, with the reason (#267)", async () => {
    const { user } = setup({ linkError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("That sign-in link has expired");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    // The reason belongs to the arrival, not to a form the person came back to.
    await user.click(screen.getByRole("button", { name: "Sign in with your password instead" }));
    await user.click(screen.getByRole("button", { name: "Sign in with an emailed link instead" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
