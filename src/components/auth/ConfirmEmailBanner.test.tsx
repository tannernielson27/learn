import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmEmailBanner, type ConfirmEmailState } from "./ConfirmEmailBanner";

function setup(result: ConfirmEmailState) {
  const action = vi.fn(async () => result);
  render(<ConfirmEmailBanner action={action} email="a@school.edu" />);
  return { action, user: userEvent.setup() };
}

describe("ConfirmEmailBanner", () => {
  it("asks, names the address, and says nothing is locked", () => {
    setup({ status: "idle" });
    expect(screen.getByRole("heading", { name: "Confirm your email address" })).toBeInTheDocument();
    expect(screen.getByText(/a@school\.edu/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is locked until then/)).toBeInTheDocument();
  });

  it("sends the email again and says so politely", async () => {
    const { action, user } = setup({ status: "sent" });
    await user.click(screen.getByRole("button", { name: "Send the email again" }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Sent\. Check your inbox/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sent.");
  });

  it("passes on a limit's message", async () => {
    const { user } = setup({ status: "error", error: "Too many requests from this network." });
    await user.click(screen.getByRole("button", { name: "Send the email again" }));
    expect(await screen.findByText("Too many requests from this network.")).toBeInTheDocument();
  });
});
