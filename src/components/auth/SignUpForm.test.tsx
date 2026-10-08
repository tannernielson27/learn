import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignUpForm, type SignUpFormProps, type SignUpState } from "./SignUpForm";

function setup(result: SignUpState, props: Partial<SignUpFormProps> = {}) {
  const action = vi.fn<SignUpFormProps["action"]>(async () => result);
  render(
    <SignUpForm
      action={action}
      initialRole={null}
      classCode={null}
      captchaSiteKey={null}
      {...props}
    />,
  );
  return { action, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Your name" }), "Ada Lovelace");
  await user.type(screen.getByRole("textbox", { name: "Email address" }), "ada@school.edu");
  await user.type(screen.getByLabelText("Password"), "correct horse battery");
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignUpForm (#361)", () => {
  it("asks the role first, and shows nothing else until it is chosen", () => {
    setup({ status: "idle" });
    expect(screen.getByRole("group", { name: "Which are you?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /I teach/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /I am a student/ })).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Your name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("shows the fields once a role is chosen, and lets the choice change", async () => {
    const { user } = setup({ status: "idle" });
    await user.click(screen.getByRole("radio", { name: /I teach/ }));
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAccessibleDescription(
      /name of your workspace/,
    );
    await user.click(screen.getByRole("radio", { name: /I am a student/ }));
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAccessibleDescription(
      /class roster/,
    );
  });

  it("starts on the role the link named", () => {
    setup({ status: "idle" }, { initialRole: "teacher" });
    expect(screen.getByRole("radio", { name: /I teach/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Your name" })).toBeInTheDocument();
  });

  it("can be completed with the keyboard alone", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.tab();
    expect(screen.getByRole("radio", { name: /I teach/ })).toHaveFocus();
    await user.keyboard(" ");
    await user.tab();
    await user.keyboard("Ada Lovelace");
    await user.tab();
    await user.keyboard("ada@school.edu");
    await user.tab();
    await user.keyboard("correct horse battery{Enter}");
    const sent = action.mock.calls[0]![1];
    expect(sent.get("role")).toBe("teacher");
    expect(sent.get("displayName")).toBe("Ada Lovelace");
    expect(sent.get("email")).toBe("ada@school.edu");
    expect(sent.get("password")).toBe("correct horse battery");
  });

  it("carries a class code for a student, and never for a teacher", async () => {
    const { action, user } = setup(
      { status: "error", error: "Try again.", field: "email" },
      { initialRole: "student", classCode: "ABCD2345" },
    );
    await fill(user);
    expect(action.mock.calls[0]![1].get("code")).toBe("ABCD2345");

    await user.click(screen.getByRole("radio", { name: /I teach/ }));
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(action.mock.calls[1]![1].get("code")).toBeNull();
  });

  it("says an address has an account, with the way to sign in, and nothing more", async () => {
    const { user } = setup(
      { status: "exists", email: "ada@school.edu" },
      { initialRole: "teacher" },
    );
    await fill(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This email already has an account. Sign in");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute("aria-invalid", "true");
    // What was typed is still there, so the person is not made to start again.
    expect(email).toHaveValue("ada@school.edu");
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("Ada Lovelace");
  });

  it("ties a refusal to its field, announces it and moves focus there", async () => {
    const { user } = setup(
      { status: "error", error: "Use at least 8 characters.", field: "password" },
      { initialRole: "student" },
    );
    await fill(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 8 characters.");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("announces a failed CAPTCHA without moving focus into a field", async () => {
    const { user } = setup(
      { status: "error", error: "The check did not pass.", field: "captcha" },
      { initialRole: "student" },
    );
    await fill(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("The check did not pass.");
    expect(screen.getByRole("textbox", { name: "Email address" })).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("tells a new account that could not be signed in here to sign in, and where it lands", async () => {
    const { user } = setup(
      { status: "created_signed_out", next: "/welcome?code=ABCD2345" },
      { initialRole: "student" },
    );
    await fill(user);
    const heading = await screen.findByRole("heading", { name: "Your account is ready" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fwelcome%3Fcode%3DABCD2345",
    );
  });

  it("draws no CAPTCHA when the site has none set up", () => {
    setup({ status: "idle" }, { initialRole: "teacher" });
    expect(screen.queryByTestId("captcha-field")).toBeNull();
  });
});
