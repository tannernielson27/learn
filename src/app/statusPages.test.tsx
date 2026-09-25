import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reporting = vi.hoisted(() => ({
  reportClientError: vi.fn(),
  startClientReporting: vi.fn(),
}));
vi.mock("@/lib/observability/reportError", () => reporting);

import RootError from "./error";
import NotFound, { metadata as notFoundMetadata } from "./not-found";

/** What a server error carries that must never reach the screen (#267, kickoff decision 4). */
const MESSAGE = 'relation "private.class_removals" does not exist at /var/task/.next/server';
const DIGEST = "2718281828";

function serverError(): Error & { digest?: string } {
  const error = new Error(MESSAGE) as Error & { digest?: string };
  error.digest = DIGEST;
  error.stack = `Error: ${MESSAGE}\n    at Page (/var/task/.next/server/app/page.js:1:1)`;
  return error;
}

describe("not-found", () => {
  it("says the page does not exist, under a focused heading", () => {
    render(<NotFound />);

    const heading = screen.getByRole("heading", { level: 1, name: "This page does not exist." });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("main")).toHaveTextContent(/mistyped|moved/);
  });

  it("offers home and sign in as real links", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("names the tab", () => {
    expect(notFoundMetadata.title).toBe("Page not found");
  });
});

describe("root error", () => {
  beforeEach(() => {
    reporting.reportClientError.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the digest as a reference and never the message or the stack", () => {
    render(<RootError error={serverError()} retry={vi.fn()} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getByText(DIGEST)).toBeInTheDocument();
    const shown = document.body.textContent ?? "";
    expect(shown).not.toContain("class_removals");
    expect(shown).not.toContain("/var/task");
    expect(shown).not.toContain(MESSAGE);
  });

  it("shows no reference line for an error without a digest", () => {
    render(<RootError error={new Error(MESSAGE)} retry={vi.fn()} reset={vi.fn()} />);

    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(MESSAGE);
  });

  it("retries on Try again and links home and to sign in", async () => {
    const retry = vi.fn();
    render(<RootError error={serverError()} retry={retry} reset={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("reports the error it caught", () => {
    const error = serverError();
    render(<RootError error={error} retry={vi.fn()} reset={vi.fn()} />);

    expect(reporting.reportClientError).toHaveBeenCalledWith(error);
  });
});
