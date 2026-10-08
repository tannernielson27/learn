import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AccountNameForm,
  type AccountNameFormProps,
  type AccountNameState,
} from "./AccountNameForm";

function setup(result: AccountNameState, name: string | null = "Ana Reyes") {
  const action = vi.fn<AccountNameFormProps["action"]>(async () => result);
  render(<AccountNameForm action={action} name={name} />);
  return { action, user: userEvent.setup() };
}

describe("AccountNameForm", () => {
  it("shows the current name, says where it appears, and caps it at 80 characters", () => {
    setup({ status: "idle" });
    const field = screen.getByRole("textbox", { name: "Your name" });
    expect(field).toHaveValue("Ana Reyes");
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("maxlength", "80");
    expect(field).toHaveAccessibleDescription(
      "Shown at the top of each page and on class rosters.",
    );
  });

  it("starts empty for an account with no name yet", () => {
    setup({ status: "idle" }, null);
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("");
  });

  it("sends the name to the action, then says it is saved", async () => {
    const { action, user } = setup({ status: "saved", name: "Sam Lee" });
    const field = screen.getByRole("textbox", { name: "Your name" });
    await user.clear(field);
    await user.type(field, "Sam Lee");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(action.mock.calls[0]![1].get("displayName")).toBe("Sam Lee");
    expect(await screen.findByRole("status")).toHaveTextContent("Name saved.");
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("Sam Lee");
  });

  it("ties a refusal to the field, announces it and moves focus there", async () => {
    const message = "Use 80 characters or fewer for your name.";
    const { user } = setup({ status: "error", error: message });
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    const field = screen.getByRole("textbox", { name: "Your name" });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows a name as text, never as markup", () => {
    setup({ status: "idle" }, "<img src=x onerror=alert(1)>");
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("img")).toBeNull();
  });
});
