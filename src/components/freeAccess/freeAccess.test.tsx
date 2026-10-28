import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RedeemState } from "@/lib/betaPass/link";
import { AcceptAccessForm } from "./AcceptAccessForm";
import { UnusableLink } from "./UnusableLink";

const HEADING = "Free access for your workspace";
const LINE = "One plain line.";
const UNUSABLE = "This link cannot be used";

function renderForm(action: (state: RedeemState) => Promise<RedeemState>) {
  render(
    <AcceptAccessForm
      action={action}
      heading={HEADING}
      line={LINE}
      unusable={UNUSABLE}
      email="fay@school.edu"
    />,
  );
}

describe("AcceptAccessForm", () => {
  it("is one heading, one line naming the account, and one button", () => {
    renderForm(vi.fn());
    expect(screen.getByRole("heading", { level: 1, name: HEADING })).toBeInTheDocument();
    expect(screen.getByText(/One plain line\. Signed in as fay@school\.edu\./)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("turns into the one neutral sentence when refused", async () => {
    renderForm(vi.fn(async () => ({ status: "unusable" }) as const));
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("heading", { level: 1, name: UNUSABLE })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows an error that is not about the link above the button", async () => {
    renderForm(vi.fn(async () => ({ status: "error", error: "Try again in a moment." }) as const));
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Try again in a moment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("UnusableLink", () => {
  it("says the sentence and offers only the way home or to sign in", () => {
    render(<UnusableLink sentence={UNUSABLE} />);
    expect(screen.getByRole("heading", { level: 1, name: UNUSABLE })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/sign-in",
    ]);
  });
});
