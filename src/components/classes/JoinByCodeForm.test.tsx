import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JoinByCodeForm, type JoinByCodeFormProps, type JoinByCodeState } from "./JoinByCodeForm";

function setup(result: JoinByCodeState, initialCode?: string) {
  const action = vi.fn<JoinByCodeFormProps["action"]>(async () => result);
  render(<JoinByCodeForm action={action} initialCode={initialCode} />);
  return { action, user: userEvent.setup() };
}

describe("JoinByCodeForm (#362)", () => {
  it("is one labelled field that says what a code looks like", () => {
    setup({ status: "idle" });
    const field = screen.getByRole("textbox", { name: "Class code" });
    expect(field).toBeRequired();
    expect(field).toHaveAccessibleDescription(
      "Eight letters and numbers, like ABCD-2345. Your instructor has it.",
    );
    expect(field).toHaveAttribute("autocapitalize", "characters");
  });

  it("sends the code exactly as typed, for the server to read", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.type(screen.getByRole("textbox", { name: "Class code" }), "abcd-2345{Enter}");
    expect(action.mock.calls[0]![1].get("code")).toBe("abcd-2345");
  });

  it("starts with a code that came with the person", () => {
    setup({ status: "idle" }, "ABCD2345");
    expect(screen.getByRole("textbox", { name: "Class code" })).toHaveValue("ABCD2345");
  });

  it("ties a refusal to the field, announces it, moves focus there and keeps what was typed", async () => {
    const { user } = setup({ status: "error", error: "That class code did not work." });
    const field = screen.getByRole("textbox", { name: "Class code" });
    await user.type(field, "ABCD-2345");
    await user.click(screen.getByRole("button", { name: "Join the class" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That class code did not work.");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/That class code did not work\./);
    expect(field).toHaveValue("ABCD-2345");
  });

  it("tells an instructor the account stays one, with the way home", async () => {
    const { user } = setup({ status: "instructor" });
    await user.type(screen.getByRole("textbox", { name: "Class code" }), "ABCD-2345{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent(/already an instructor/);
    expect(screen.getByRole("link", { name: "Go to your item banks" })).toHaveAttribute(
      "href",
      "/author",
    );
    expect(screen.queryByRole("textbox", { name: "Class code" })).toBeNull();
  });
});
