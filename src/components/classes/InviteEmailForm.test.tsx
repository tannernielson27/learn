import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  InviteEmailForm,
  type InviteEmailFormProps,
  type InviteLinkState,
} from "./InviteEmailForm";
import { INVITE_UNAVAILABLE_HEADING } from "./InviteUnavailable";

function setup(result: InviteLinkState) {
  const action = vi.fn<InviteEmailFormProps["action"]>(async () => result);
  render(<InviteEmailForm action={action} classTitle="NUR 310 — Fall" />);
  return { action, user: userEvent.setup() };
}

async function submit(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByRole("textbox", { name: "Email address" }), email);
  await user.click(screen.getByRole("button", { name: "Email me a link to join" }));
}

describe("InviteEmailForm", () => {
  it("names the class and asks for an email", () => {
    setup({ status: "idle" });
    expect(screen.getByRole("heading", { level: 1, name: "Join NUR 310 — Fall" })).toBeVisible();
    const field = screen.getByRole("textbox", { name: "Email address" });
    expect(field).toHaveAttribute("type", "email");
    expect(field).toHaveAttribute("autocomplete", "email");
    expect(field).toBeRequired();
  });

  it("sends the email to the action and says where the link went", async () => {
    const { action, user } = setup({ status: "sent", email: "a@school.edu" });
    await submit(user, "a@school.edu");
    expect(action.mock.calls[0]![1].get("email")).toBe("a@school.edu");
    const heading = await screen.findByRole("heading", { name: "Check your email" });
    expect(heading).toHaveFocus();
    expect(screen.getByText(/a@school\.edu/)).toBeInTheDocument();
  });

  it("ties an error to the field", async () => {
    const { user } = setup({ status: "error", error: "Enter an email." });
    await submit(user, "a@school.edu");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an email.");
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAccessibleDescription(
      "Enter an email.",
    );
  });

  it("says the link stopped working when the token was rotated after the page loaded", async () => {
    const { user } = setup({ status: "invalid" });
    await submit(user, "a@school.edu");
    expect(
      await screen.findByRole("heading", { name: INVITE_UNAVAILABLE_HEADING }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
