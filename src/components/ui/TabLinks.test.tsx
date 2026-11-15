import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabLinks } from "./TabLinks";

const links = [
  { href: "/report", label: "Students", current: false },
  { href: "/report?view=items", label: "Questions", current: true },
];

describe("TabLinks", () => {
  it("is a named navigation of links, not a tablist", () => {
    render(<TabLinks label="Report views" links={links} />);
    const nav = screen.getByRole("navigation", { name: "Report views" });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute("href", "/report");
  });

  it("marks the current view as the current page, in the selected tab's colours", () => {
    render(<TabLinks label="Report views" links={links} />);
    const current = screen.getByRole("link", { name: "Questions" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("border-accent");
    const other = screen.getByRole("link", { name: "Students" });
    expect(other).not.toHaveAttribute("aria-current");
    expect(other).toHaveClass("border-transparent");
  });
});
