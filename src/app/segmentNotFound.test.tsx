import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import AuthorNotFound, { metadata as authorMetadata } from "./author/not-found";
import LearnNotFound, { metadata as learnMetadata } from "./learn/not-found";
import RootNotFound from "./not-found";

/**
 * #563: every 404 has one layout (`ErrorState`'s not-found kind under the page title's style, one
 * sentence) and a way home. A teacher's and a student's are drawn inside their own `AppShell`, by
 * their segment's `not-found.tsx`, so the way home is their own home.
 */
describe.each<[string, ComponentType, string, string]>([
  ["a teacher's page", AuthorNotFound, "Back to the library", "/author"],
  ["a student's page", LearnNotFound, "Back to your classes", "/learn"],
  ["any other page", RootNotFound, "Go to the home page", "/"],
])("not found: %s", (_, NotFound, name, href) => {
  it("says the page does not exist under a focused h1 in the page title's style", () => {
    render(<NotFound />);

    const heading = screen.getByRole("heading", { level: 1, name: "This page does not exist." });
    expect(heading).toHaveFocus();
    expect(heading).toHaveClass("display-section");
    expect(screen.getAllByRole("heading")).toEqual([heading]);
    expect(screen.getByText("The link may be old, or the address mistyped.")).toBeVisible();
  });

  it("offers the way home", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("is not an alert: nothing went wrong that a screen reader must hear at once", () => {
    render(<NotFound />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("segment not-found pages", () => {
  it("each signed-in one keeps out of the root frame: no main of its own and no wordmark", () => {
    for (const NotFound of [AuthorNotFound, LearnNotFound]) {
      const { container, unmount } = render(<NotFound />);
      // The segment's AppShell draws the main and the wordmark around it.
      expect(container.querySelector("main")).toBeNull();
      expect(screen.queryByRole("link", { name: "LeaRN" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("names the tab as the root one does", () => {
    expect(authorMetadata.title).toBe("Page not found");
    expect(learnMetadata.title).toBe("Page not found");
  });
});
