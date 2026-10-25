import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CLASS_TABS, type ClassTab } from "@/lib/classes/classTabs";
import { ClassTabs } from "./ClassTabs";

const CLASS = "00000000-0000-4000-8000-00000000c1a5";

function links(current: ClassTab) {
  render(<ClassTabs classId={CLASS} current={current} />);
  return within(screen.getByRole("navigation", { name: "Class views" })).getAllByRole("link");
}

describe("ClassTabs", () => {
  it("links to each part of the class page, in order, keeping the part in the address", () => {
    const all = links("overview");
    expect(all.map((link) => link.textContent)).toEqual([
      "Overview",
      "Students",
      "Progress",
      "Live sessions",
      "Assignments",
      "Settings",
    ]);
    expect(all.map((link) => link.getAttribute("href"))).toEqual([
      `/author/classes/${CLASS}`,
      `/author/classes/${CLASS}?tab=students`,
      `/author/classes/${CLASS}?tab=progress`,
      `/author/classes/${CLASS}?tab=sessions`,
      `/author/classes/${CLASS}?tab=assignments`,
      `/author/classes/${CLASS}?tab=settings`,
    ]);
  });

  it.each(CLASS_TABS)("marks %s as the current page, and only it", (tab) => {
    const all = links(tab);
    const marked = all.filter((link) => link.hasAttribute("aria-current"));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute("aria-current", "page");
    expect(marked[0]).toHaveAttribute(
      "href",
      expect.stringMatching(tab === "overview" ? /[0-9a-f]$/ : new RegExp(`tab=${tab}$`)),
    );
  });

  it("is a list of links, so the keyboard reaches each with Tab and no arrow-key trap", () => {
    links("students");
    const nav = screen.getByRole("navigation", { name: "Class views" });
    expect(within(nav).getByRole("list")).toBeInTheDocument();
    expect(within(nav).queryByRole("tablist")).not.toBeInTheDocument();
  });
});
