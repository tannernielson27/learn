import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/live/displayName";
import { JoinForm, type JoinFormProps, type JoinState } from "./JoinForm";

function setup(result: JoinState, code = "") {
  const action = vi.fn<JoinFormProps["action"]>(async () => result);
  render(<JoinForm action={action} code={code} />);
  return { action, user: userEvent.setup() };
}

const codeField = () => screen.getByRole("textbox", { name: "Session code" });
const nameField = () => screen.getByRole("textbox", { name: "Display name" });
// Anchored, because "Join" is a prefix of the heading and the hint text around it.
const joinButton = () => screen.getByRole("button", { name: /^Join$/ });

describe("JoinForm", () => {
  it("asks for a code and a name, and nothing else", () => {
    setup({ status: "idle" });
    expect(codeField()).toBeRequired();
    expect(nameField()).toBeRequired();
    expect(nameField()).toHaveAttribute("maxlength", String(DISPLAY_NAME_MAX_LENGTH));
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(joinButton()).toBeEnabled();
  });

  it("sends both fields to the action", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.type(codeField(), "7kq2mz");
    await user.type(nameField(), "Sam Okafor");
    await user.click(joinButton());

    const data = action.mock.calls[0][1];
    expect(data.get("code")).toBe("7kq2mz");
    expect(data.get("displayName")).toBe("Sam Okafor");
  });

  it("fills in a code that arrived in the address and waits on the name", () => {
    setup({ status: "idle" }, "7KQ2MZ");
    expect(codeField()).toHaveValue("7KQ2MZ");
    expect(nameField()).toHaveFocus();
  });

  it("starts on the code when there is none to fill in", () => {
    setup({ status: "idle" });
    expect(codeField()).toHaveFocus();
  });

  it("ties a code error to the code field, announces it and moves focus there", async () => {
    const message = "Enter the six-character code on the screen.";
    const { user } = setup({ status: "error", field: "code", error: message });
    await user.type(codeField(), "nope");
    await user.type(nameField(), "Sam");
    await user.click(joinButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(codeField()).toHaveAccessibleDescription(message);
    expect(nameField()).not.toHaveAttribute("aria-invalid");
    expect(codeField()).toHaveFocus();
  });

  it("ties a name error to the name field and moves focus there instead", async () => {
    const message = "Display names are 32 characters or fewer.";
    const { user } = setup({ status: "error", field: "displayName", error: message });
    await user.type(codeField(), "7KQ2MZ");
    await user.type(nameField(), "x");
    await user.click(joinButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(nameField()).toHaveAccessibleDescription(message);
    expect(nameField()).toHaveFocus();
    expect(codeField()).not.toHaveAttribute("aria-invalid");
  });

  it("announces an error that belongs to neither field without marking either", async () => {
    const message = "Joining is not working just now. Try again in a moment.";
    const { user } = setup({ status: "error", error: message });
    await user.type(codeField(), "7KQ2MZ");
    await user.type(nameField(), "Sam");
    await user.click(joinButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(codeField()).not.toHaveAttribute("aria-invalid");
    expect(nameField()).not.toHaveAttribute("aria-invalid");
  });

  it("describes each field while nothing is wrong, so the hints are read out", () => {
    setup({ status: "idle" });
    expect(codeField()).toHaveAccessibleDescription(
      "Six characters, from the screen at the front.",
    );
    expect(nameField()).toHaveAccessibleDescription(
      `The rest of the class sees this. Up to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    );
  });

  it("uses no emoji anywhere, per docs/04 §7", () => {
    setup({ status: "error", error: "Joining is not working just now. Try again in a moment." });
    expect(document.body.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
