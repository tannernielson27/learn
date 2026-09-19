import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DemoSignIn, type DemoSignInProps, type DemoSignInState } from "./DemoSignIn";

function setup(result: DemoSignInState, next = "/author") {
  const action = vi.fn<DemoSignInProps["action"]>(async () => result);
  render(<DemoSignIn action={action} next={next} />);
  return { action, user: userEvent.setup() };
}

describe("DemoSignIn", () => {
  it("offers the demo under its own heading and says the account is shared", () => {
    setup({ status: "idle" });
    expect(screen.getByRole("heading", { name: "Try the demo" })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Use the demo account" });
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription(/shared instructor account/);
  });

  it("sends the next path to the action", async () => {
    const { action, user } = setup({ status: "idle" }, "/author/banks/1");
    await user.click(screen.getByRole("button", { name: "Use the demo account" }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1].get("next")).toBe("/author/banks/1");
  });

  it("announces a failure and ties it to the button", async () => {
    const { user } = setup({ status: "error", error: "The demo account could not sign in." });
    await user.click(screen.getByRole("button", { name: "Use the demo account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The demo account could not sign in.",
    );
    expect(
      screen.getByRole("button", { name: "Use the demo account" }),
    ).toHaveAccessibleDescription(/^The demo account could not sign in\. Signs you in/);
  });
});
