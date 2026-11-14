import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { APP_NAV_LINK_CLASSES, APP_NAV_LIST_CLASSES, AppShell } from "./AppShell";

describe("AppShell", () => {
  it("has one banner, one named primary navigation and one main", () => {
    render(
      <AppShell
        homeHref="/author"
        nav={<nav aria-label="Main">Library</nav>}
        account={<button type="button">Account menu</button>}
      >
        <h1>Library</h1>
      </AppShell>,
    );
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("draws the site's wordmark home, read as one word", () => {
    render(
      <AppShell homeHref="/author">
        <p>Body</p>
      </AppShell>,
    );
    const home = screen.getByRole("link", { name: "LeaRN" });
    expect(home).toHaveAttribute("href", "/author");
    // The site's Wordmark: "Lea" in the serif and "RN" in its hairline box.
    expect(home).toHaveClass("font-read");
    expect(within(home).getByText("RN")).toHaveClass("border-rule-strong");
  });

  it("puts the layout's own wordmark link in the bar when it brings one", () => {
    render(
      <AppShell homeHref="/" brand={<a href="/guarded">LeaRN</a>}>
        <p>Body</p>
      </AppShell>,
    );
    const links = within(screen.getByRole("banner")).getAllByRole("link", { name: "LeaRN" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/guarded");
  });

  it("keeps the wordmark and the account on one 64px row, with the nav on its own row below", () => {
    render(
      <AppShell
        homeHref="/author"
        nav={<nav aria-label="Main">Library</nav>}
        account={<button type="button">Account menu</button>}
      >
        <p>Body</p>
      </AppShell>,
    );
    const banner = screen.getByRole("banner");
    const [brand, navRow, account] = Array.from(banner.children);
    expect(brand).toHaveClass("h-16");
    expect(account).toHaveClass("h-16", "ml-auto");
    expect(account).toContainElement(screen.getByRole("button", { name: "Account menu" }));
    // On a phone the nav row is last and full width; from 1024px it joins the bar's one row.
    expect(navRow).toHaveClass("order-last", "basis-full", "@min-[63rem]/shell:order-none");
    expect(banner).toHaveClass("flex-wrap", "@min-[63rem]/shell:flex-nowrap");
  });

  it("gives the nav list one row that scrolls, never wraps, and 44px links", () => {
    expect(APP_NAV_LIST_CLASSES).toContain("flex-nowrap");
    expect(APP_NAV_LIST_CLASSES).toContain("overflow-x-auto");
    expect(APP_NAV_LIST_CLASSES).toContain("h-11");
    expect(APP_NAV_LIST_CLASSES).not.toMatch(/(^|\s)flex-wrap/);
    expect(APP_NAV_LINK_CLASSES).toContain("tap-target");
    expect(APP_NAV_LINK_CLASSES).toContain("whitespace-nowrap");
  });

  it("centres every column with the shell's gutters, whatever its cap", () => {
    const { rerender } = render(
      <AppShell homeHref="/">
        <p>Body</p>
      </AppShell>,
    );
    const main = () => screen.getByRole("main");
    expect(main()).toHaveClass("mx-auto", "px-(--shell-gutter)", "py-8");
    expect(main().className).toContain("var(--content-reading)");
    rerender(
      <AppShell homeHref="/" width="wide">
        <p>Body</p>
      </AppShell>,
    );
    expect(main()).toHaveClass("mx-auto", "px-(--shell-gutter)");
    expect(main().className).toContain("var(--content-wide)");
    rerender(
      <AppShell homeHref="/" width="full">
        <p>Body</p>
      </AppShell>,
    );
    expect(main()).toHaveClass("mx-auto", "px-(--shell-gutter)");
    expect(main().className).not.toMatch(/max-w-/);
  });

  it("has no empty slots", () => {
    render(
      <AppShell homeHref="/" width="full">
        <p>Body</p>
      </AppShell>,
    );
    expect(screen.getByRole("banner").children).toHaveLength(1);
  });

  it("draws a specimen without landmarks, for a gallery page that has its own", () => {
    render(
      <AppShell homeHref="/" landmarks={false} nav={<nav aria-label="Specimen">Library</nav>}>
        <p>Body</p>
      </AppShell>,
    );
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getByRole("link", { name: "LeaRN" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("puts a notice between the bar and the content", () => {
    render(
      <AppShell homeHref="/" notice={<p role="status">Your trial ends soon.</p>}>
        <p>Body</p>
      </AppShell>,
    );
    const notice = screen.getByRole("status");
    expect(screen.getByRole("banner").nextElementSibling).toBe(notice);
    expect(notice.nextElementSibling).toBe(screen.getByRole("main"));
  });
});
