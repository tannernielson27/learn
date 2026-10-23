import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("has the wordmark home, the navigation and the account end of the bar", () => {
    render(
      <AppShell
        homeHref="/author"
        nav={<nav aria-label="Main">Library</nav>}
        account={<button type="button">Account menu</button>}
      >
        <h1>Library</h1>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "LeaRN" })).toHaveAttribute("href", "/author");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    // Today's reading column, so no page reflows until its phase widens it.
    expect(screen.getByRole("main")).toHaveClass("max-w-reading", "mx-auto", "px-4", "py-8");
  });

  it("takes the layout's own wordmark link and a wider column", () => {
    render(
      <AppShell homeHref="/" brand={<a href="/guarded">LeaRN</a>} width="wide">
        <p>Body</p>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "LeaRN" })).toHaveAttribute("href", "/guarded");
    expect(screen.getByRole("main")).toHaveClass("max-w-wide");
  });

  it("has no cap at full width, and no empty slots", () => {
    const { container } = render(
      <AppShell homeHref="/" width="full">
        <p>Body</p>
      </AppShell>,
    );
    expect(screen.getByRole("main").className).not.toMatch(/max-w-/);
    expect(container.querySelector("header")!.children).toHaveLength(1);
  });
});
