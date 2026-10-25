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

const codeField = () => screen.getByRole("textbox", { name: "Join code" });
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

  it("labels the phone keyboard's Enter key Next on the code and Go on the name", () => {
    setup({ status: "idle" });
    expect(codeField()).toHaveAttribute("enterkeyhint", "next");
    expect(nameField()).toHaveAttribute("enterkeyhint", "go");
  });

  it("moves on to the name when Enter is pressed on the code, rather than sending half a form", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.type(codeField(), "7kq2mz{Enter}");
    expect(nameField()).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("sends the form from the code field once the name is filled in", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.type(nameField(), "Sam Okafor");
    await user.type(codeField(), "7kq2mz{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("ties a code error to the code field, announces it and moves focus there", async () => {
    const message = "Enter the six-character join code on the screen.";
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
    expect(codeField()).toHaveAccessibleDescription("Six characters, on the screen at the front.");
    expect(nameField()).toHaveAccessibleDescription(
      "Your teacher sees this name. The class sees it only before the start.",
    );
  });

  it("makes Join the full-width main action, at the phone's large size", () => {
    render(<JoinForm action={vi.fn()} code="" />);
    expect(joinButton()).toHaveClass("w-full", "min-h-(--button-height-lg)");
  });

  it("uses no emoji anywhere, per docs/04 §7", () => {
    setup({ status: "error", error: "Joining is not working just now. Try again in a moment." });
    expect(document.body.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("JoinForm for a signed-in student (ADR 0013)", () => {
  it("fills in the name it is given, and leaves it editable", async () => {
    const action = vi.fn<JoinFormProps["action"]>(async () => ({ status: "idle" }));
    render(<JoinForm action={action} code="7KQ2MZ" defaultName="Mia Chen" />);
    expect(nameField()).toHaveValue("Mia Chen");
    const user = userEvent.setup();
    await user.clear(nameField());
    await user.type(nameField(), "Mia C");
    await user.click(joinButton());
    const sent = action.mock.calls[0]?.[1];
    expect(sent?.get("displayName")).toBe("Mia C");
    // Not a guest unless asked: the server reads the account itself.
    expect(sent?.get("guest")).toBeNull();
  });

  it("posts guest only when the person chose to join as a guest, and still nothing else", async () => {
    const action = vi.fn<JoinFormProps["action"]>(async () => ({ status: "idle" }));
    render(<JoinForm action={action} code="7KQ2MZ" asGuest />);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    const user = userEvent.setup();
    await user.type(nameField(), "Sam");
    await user.click(joinButton());
    const sent = action.mock.calls[0]?.[1];
    expect(sent?.get("guest")).toBe("1");
    // There is no field an account id could be posted in.
    expect([...(sent?.keys() ?? [])].sort()).toEqual(["code", "displayName", "guest"]);
  });
});
