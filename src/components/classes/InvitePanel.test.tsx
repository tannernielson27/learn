import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InvitePanel, type InvitePanelProps } from "./InvitePanel";
import type { InviteSignUpState } from "./InviteSignUpForm";

function setup(result: InviteSignUpState = { status: "idle" }) {
  const signUpAction = vi.fn<InvitePanelProps["signUpAction"]>(async () => result);
  const linkAction = vi.fn<InvitePanelProps["linkAction"]>(async (_state, data) => ({
    status: "sent",
    email: String(data.get("email")),
  }));
  const codeAction = vi.fn<InvitePanelProps["codeAction"]>(async () => ({ status: "idle" }));
  render(
    <InvitePanel
      signUpAction={signUpAction}
      linkAction={linkAction}
      codeAction={codeAction}
      codeNext="/c/tok"
      classTitle="NUR 310"
    />,
  );
  return { signUpAction, linkAction, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByRole("textbox", { name: "Email address" }), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Join the class" }));
}

describe("InvitePanel", () => {
  it("opens on an email address and a new password, with the rule beside it", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Join NUR 310" })).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAccessibleDescription("At least 8 characters.");
  });

  it("sends the email and password to the sign-up action", async () => {
    const { signUpAction, user } = setup();
    await fill(user, "a@school.edu", "correct horse");
    const data = signUpAction.mock.calls[0]![1];
    expect(data.get("email")).toBe("a@school.edu");
    expect(data.get("password")).toBe("correct horse");
  });

  it("says when the address already has an account, on the password, and offers the link", async () => {
    const { user } = setup({ status: "exists", email: "a@school.edu" });
    await fill(user, "a@school.edu", "wrong horse!");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("a@school.edu already has a LeaRN account");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Join with an emailed link instead" }),
    ).toBeInTheDocument();
  });

  it("puts an address error on the email field", async () => {
    const { user } = setup({ status: "error", error: "Enter an email.", field: "email" });
    await fill(user, "a@b", "correct horse");
    await screen.findByRole("alert");
    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveAccessibleDescription("Enter an email.");
    expect(email).toHaveFocus();
  });

  it("tells someone whose account was made but not signed in where to go", async () => {
    const { user } = setup({ status: "created_signed_out" });
    await fill(user, "a@school.edu", "correct horse");
    expect(await screen.findByRole("heading", { name: "Your account is ready" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Flearn",
    );
  });

  it("shows the invite as unavailable when the link stopped working meanwhile", async () => {
    const { user } = setup({ status: "invalid" });
    await fill(user, "a@school.edu", "correct horse");
    expect(screen.queryByRole("button", { name: "Join the class" })).not.toBeInTheDocument();
  });

  it("switches to the emailed link carrying the address, and back", async () => {
    const { linkAction, user } = setup();
    await user.type(screen.getByRole("textbox", { name: "Email address" }), "a@school.edu");
    await user.click(screen.getByRole("button", { name: "Join with an emailed link instead" }));
    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveValue("a@school.edu");
    expect(email).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Email me a link to join" }));
    expect(linkAction.mock.calls[0]![1].get("email")).toBe("a@school.edu");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join with a password instead" }));
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
});
