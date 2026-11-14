import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState: could not load", () => {
  it("says what happened as an alert, under a focused page heading", () => {
    render(
      <ErrorState
        kind="load"
        headline="This screen stopped working."
        detail="Your place in the session is kept."
        onRetry={vi.fn()}
      />,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("This screen stopped working.");
    expect(heading).toHaveFocus();
    expect(heading).toHaveClass("display-section");
    expect(screen.getByRole("alert")).toHaveTextContent("Your place in the session is kept.");
    expect(screen.getByRole("region", { name: "This screen stopped working." })).toBeVisible();
  });

  it("retries when Try again is pressed", async () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="load" headline="Stopped." detail="Try again." onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a digest as a reference when there is one, and no line without", () => {
    const { rerender } = render(
      <ErrorState
        kind="load"
        headline="Stopped."
        detail="Try again."
        digest="99"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/Reference/)).toHaveTextContent("Reference 99");
    rerender(<ErrorState kind="load" headline="Stopped." detail="Try again." onRetry={vi.fn()} />);
    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
  });

  it("renders the ways out it is given after Try again", () => {
    render(
      <ErrorState kind="load" headline="Stopped." detail="Try again." onRetry={vi.fn()}>
        <a href="/sign-in">Sign in</a>
      </ErrorState>,
    );
    const retry = screen.getByRole("button", { name: "Try again" });
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(retry.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ErrorState: not found and no access", () => {
  it("says a page does not exist, as a calm status with no Try again", () => {
    render(
      <ErrorState kind="not-found">
        <a href="/help">Go to the home page</a>
      </ErrorState>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "This page does not exist." }),
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(/link may be old/);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toBeInTheDocument();
  });

  it("says a page is not for this account, with a lock rather than an alarm", () => {
    const { container } = render(<ErrorState kind="no-access" />);
    expect(
      screen.getByRole("heading", { name: "You do not have access to this page." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Ask whoever shared it/);
    expect(container.querySelector("svg")).toHaveClass("lucide-lock");
  });

  it("takes a page's own headline and detail", () => {
    render(
      <ErrorState
        kind="no-access"
        headline="This quiz is not shared with you."
        detail="Ask its owner."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "This quiz is not shared with you." }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Ask its owner.");
  });

  it("heads a part of a page without taking focus below level 1", () => {
    render(<ErrorState kind="not-found" level={3} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).not.toHaveFocus();
  });
});

describe("ErrorState colours", () => {
  it.each(["load", "not-found", "no-access"] as const)(
    "uses only the neutral notice colours for %s, never feedback red",
    (kind) => {
      const { container } =
        kind === "load"
          ? render(<ErrorState kind="load" headline="Stopped." detail="x" onRetry={vi.fn()} />)
          : render(<ErrorState kind={kind} />);
      expect(container.innerHTML).not.toMatch(/incorrect|correct-|flag/);
      expect(container.querySelector("[data-notice]")).toHaveClass("bg-notice-soft");
    },
  );

  it("never reads the error itself", () => {
    const source = readFileSync(join(process.cwd(), "src/components/ui/ErrorState.tsx"), "utf8");
    expect(source).not.toMatch(/\.message|\.stack/);
  });
});
