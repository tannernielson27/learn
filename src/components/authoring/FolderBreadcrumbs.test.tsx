import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FolderRow } from "@/lib/authoring/folders";
import { FolderBreadcrumbs } from "./FolderBreadcrumbs";

const trail: FolderRow[] = [
  { id: "f1", parentId: null, name: "Cardiac" },
  { id: "f3", parentId: "f1", name: "Heart failure" },
];

const crumbs = () => screen.getByRole("navigation", { name: "Breadcrumb" });

describe("FolderBreadcrumbs", () => {
  it("links up from a folder to its parents, the bank and the bank list", () => {
    render(
      <FolderBreadcrumbs
        bankId="b1"
        bankName="Med-surg"
        trail={trail}
        view={{ kind: "folder", id: "f3" }}
      />,
    );
    const nav = within(crumbs());
    expect(nav.getByRole("link", { name: "Item banks" })).toHaveAttribute("href", "/author");
    expect(nav.getByRole("link", { name: "Med-surg" })).toHaveAttribute("href", "/author/banks/b1");
    expect(nav.getByRole("link", { name: "Cardiac" })).toHaveAttribute(
      "href",
      "/author/banks/b1?folder=f1",
    );
    const current = nav.getByText("Heart failure");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });

  it("ends at the bank when everything is shown", () => {
    render(<FolderBreadcrumbs bankId="b1" bankName="Med-surg" trail={[]} view={{ kind: "all" }} />);
    const nav = within(crumbs());
    expect(nav.getByText("Med-surg")).toHaveAttribute("aria-current", "page");
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Item banks"]);
  });

  it("ends at Unfiled for unfiled content", () => {
    render(
      <FolderBreadcrumbs bankId="b1" bankName="Med-surg" trail={[]} view={{ kind: "unfiled" }} />,
    );
    const nav = within(crumbs());
    expect(nav.getByRole("link", { name: "Med-surg" })).toBeInTheDocument();
    expect(nav.getByText("Unfiled")).toHaveAttribute("aria-current", "page");
  });
});
