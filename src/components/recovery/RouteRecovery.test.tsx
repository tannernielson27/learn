import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RouteRecovery } from "./RouteRecovery";

describe("RouteRecovery", () => {
  it("says what happened as an alert, under a page heading", () => {
    render(
      <RouteRecovery
        headline="This screen stopped working."
        detail="Your place in the session is kept."
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This screen stopped working.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Your place in the session is kept.");
  });

  it("retries when Try again is pressed", async () => {
    const onRetry = vi.fn();
    render(<RouteRecovery headline="Stopped." detail="Try again." onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
