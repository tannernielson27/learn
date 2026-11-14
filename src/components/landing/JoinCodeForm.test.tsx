import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JOIN_CODE_ERROR } from "@/lib/live/joinForm";
import { JoinCodeForm, type JoinCodeFormProps, type JoinCodeState } from "./JoinCodeForm";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

function setup(result: JoinCodeState = { status: "idle" }) {
  const action = vi.fn<NonNullable<JoinCodeFormProps["action"]>>(async () => result);
  render(<JoinCodeForm action={action} />);
  return { action, user: userEvent.setup() };
}

const codeField = () => screen.getByRole("textbox", { name: "Join code" });
const joinButton = () => screen.getByRole("button", { name: /^Join$/ });

// #563: the student's door on the landing page, the code alone.
describe("JoinCodeForm", () => {
  it("asks for the six-character join code and nothing else, as a phone keyboard wants it", () => {
    setup();
    const field = codeField();
    expect(screen.getAllByRole("textbox")).toEqual([field]);
    expect(field).toHaveAttribute("name", "code");
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("autocapitalize", "characters");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("autocorrect", "off");
    expect(field).toHaveAttribute("spellcheck", "false");
    // Room for the spaced form people copy off a screen ("ABC DEF"), as on the join page.
    expect(field).toHaveAttribute("maxlength", "9");
    expect(field).not.toHaveFocus();
    expect(field).toHaveAccessibleDescription("In class now? No account needed.");
    expect(joinButton()).toHaveAttribute("type", "submit");
  });

  it("is a named form, so it is a landmark a screen reader can jump to", () => {
    setup();
    expect(screen.getByRole("form", { name: "Join a live session" })).toContainElement(codeField());
  });

  it("sends what was typed to the action, from the button or from Enter", async () => {
    const { action, user } = setup();
    await user.type(codeField(), "7kq 2mz");
    await user.click(joinButton());
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1].get("code")).toBe("7kq 2mz");

    await user.clear(codeField());
    await user.type(codeField(), "ABC234{Enter}");
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][1].get("code")).toBe("ABC234");
  });

  it("ties a refusal to the field, announces it and moves focus there", async () => {
    const { user } = setup({ status: "error", error: JOIN_CODE_ERROR, typed: "nope" });
    await user.type(codeField(), "nope");
    await user.click(joinButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(JOIN_CODE_ERROR);
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(codeField()).toHaveAccessibleDescription(
      `In class now? No account needed. ${JOIN_CODE_ERROR}`,
    );
    expect(codeField()).toHaveFocus();
    // What was typed stays in the field, to be corrected rather than typed again.
    expect(codeField()).toHaveValue("nope");
  });

  // No JavaScript: the server's HTML is a real form with a real submit button, so it posts.
  it("renders as a plain form with a submit button on the server", () => {
    const html = renderToStaticMarkup(<JoinCodeForm />);
    expect(html).toMatch(/<form[^>]*>/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Join<\/button>/);
    expect(html).toContain('name="code"');
  });
});
