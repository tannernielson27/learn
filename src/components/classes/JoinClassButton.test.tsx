import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { INVITE_UNAVAILABLE_HEADING } from "./InviteUnavailable";
import {
  ALREADY_INSTRUCTOR,
  JoinClassButton,
  type JoinClassButtonProps,
  type JoinClassState,
} from "./JoinClassButton";

function setup(result: JoinClassState) {
  const action = vi.fn<JoinClassButtonProps["action"]>(async () => result);
  render(<JoinClassButton action={action} classTitle="NUR 310" email="a@school.edu" />);
  return { action, user: userEvent.setup() };
}

describe("JoinClassButton", () => {
  it("offers one tap to join, as the signed-in account", async () => {
    const { action, user } = setup({ status: "idle" });
    expect(screen.getByRole("heading", { level: 1, name: "Join NUR 310" })).toBeVisible();
    expect(screen.getByText(/a@school\.edu/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join NUR 310" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("tells an instructor they already are one", async () => {
    const { user } = setup({ status: "instructor" });
    await user.click(screen.getByRole("button", { name: "Join NUR 310" }));
    expect(await screen.findByRole("status")).toHaveTextContent(ALREADY_INSTRUCTOR);
  });

  it("answers a token that stopped working with the one unavailable message", async () => {
    const { user } = setup({ status: "invalid" });
    await user.click(screen.getByRole("button", { name: "Join NUR 310" }));
    expect(await screen.findByRole("heading", { name: INVITE_UNAVAILABLE_HEADING })).toBeVisible();
  });

  it("announces an error", async () => {
    const { user } = setup({ status: "error", error: "Try again." });
    await user.click(screen.getByRole("button", { name: "Join NUR 310" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again.");
  });
});
