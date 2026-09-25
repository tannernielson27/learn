import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RouteRecovery } from "./RouteRecovery";

describe("RouteRecovery", () => {
  it("says what happened as an alert, under a focused page heading", () => {
    render(
      <RouteRecovery
        headline="This screen stopped working."
        detail="Your place in the session is kept."
        onRetry={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("This screen stopped working.");
    expect(heading).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Your place in the session is kept.");
  });

  it("retries when Try again is pressed", async () => {
    const onRetry = vi.fn();
    render(<RouteRecovery headline="Stopped." detail="Try again." onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a digest as a reference when there is one", () => {
    render(<RouteRecovery headline="Stopped." detail="Try again." digest="99" onRetry={vi.fn()} />);

    expect(screen.getByText(/Reference/)).toHaveTextContent("Reference 99");
  });

  it("shows no reference line without a digest", () => {
    render(<RouteRecovery headline="Stopped." detail="Try again." onRetry={vi.fn()} />);

    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
  });

  it("renders what it is given after Try again", () => {
    render(
      <RouteRecovery headline="Stopped." detail="Try again." onRetry={vi.fn()}>
        <a href="/sign-in">Sign in</a>
      </RouteRecovery>,
    );

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});
