import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  InviteColleagueForm,
  type InviteColleagueFormProps,
  type InviteColleagueState,
} from "./InviteColleagueForm";

function setup(result: InviteColleagueState) {
  const action = vi.fn<InviteColleagueFormProps["action"]>(async () => result);
  const view = render(<InviteColleagueForm action={action} />);
  return { action, user: userEvent.setup(), ...view };
}

const field = () => screen.getByRole("textbox", { name: "Colleague's email address" });

async function submit(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(field(), email);
  await user.click(screen.getByRole("button", { name: "Send invitation" }));
}

describe("InviteColleagueForm", () => {
  it("asks for one email address and says how long the link lasts", () => {
    setup({ status: "idle" });
    expect(field()).toHaveAttribute("type", "email");
    expect(field()).toHaveAttribute("name", "email");
    expect(field()).toBeRequired();
    expect(field()).toHaveAttribute("maxlength", "254");
    expect(field()).toHaveAccessibleDescription(
      "The link works for this address only and lasts 7 days.",
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("sends the address to the action, says where the invitation went and empties the field", async () => {
    const { action, user } = setup({ status: "sent", email: "kim@school.edu" });
    await submit(user, "kim@school.edu");
    expect(action.mock.calls[0]![1].get("email")).toBe("kim@school.edu");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invitation sent to kim@school.edu.",
    );
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
  });

  it("ties a refusal to the field and keeps what was typed", async () => {
    const { user } = setup({
      status: "error",
      error: "That address already belongs to a member of this workspace.",
    });
    await submit(user, "kim@school.edu");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That address already belongs to a member of this workspace.",
    );
    expect(field()).toHaveAccessibleDescription(
      "That address already belongs to a member of this workspace.",
    );
    expect(field()).toBeInvalid();
    expect(field()).toHaveValue("kim@school.edu");
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("draws an address that looks like markup as text", async () => {
    const hostile = '<img src=x onerror="alert(1)">@school.edu';
    const { user, container } = setup({ status: "sent", email: hostile });
    await submit(user, "kim@school.edu");
    expect(await screen.findByRole("status")).toHaveTextContent(hostile);
    expect(container.querySelector("img")).toBeNull();
  });
});
