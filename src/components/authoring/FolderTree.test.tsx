import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FolderRow } from "@/lib/authoring/folders";
import { FolderTree } from "./FolderTree";

const BANK = "b1";
const folders: FolderRow[] = [
  { id: "f2", parentId: null, name: "Respiratory" },
  { id: "f1", parentId: null, name: "Cardiac" },
  { id: "f3", parentId: "f1", name: "Heart failure" },
];

const tree = () => screen.getByRole("navigation", { name: "Folders" });
// A string name matches the whole accessible name, so "Cardiac" never matches "Cardiac care".
const link = (name: string) => within(tree()).getByRole("link", { name });

describe("FolderTree", () => {
  it("links to everything, to unfiled content, and to each folder", () => {
    render(<FolderTree bankId={BANK} folders={folders} view={{ kind: "all" }} />);
    expect(link("All content")).toHaveAttribute("href", "/author/banks/b1");
    expect(link("Unfiled")).toHaveAttribute("href", "/author/banks/b1?folder=unfiled");
    expect(link("Cardiac")).toHaveAttribute("href", "/author/banks/b1?folder=f1");
    const names = within(tree())
      .getAllByRole("link")
      .map((element) => element.textContent);
    expect(names).toEqual(["All content", "Unfiled", "Cardiac", "Heart failure", "Respiratory"]);
  });

  it("nests a folder inside its parent's list entry", () => {
    render(<FolderTree bankId={BANK} folders={folders} view={{ kind: "all" }} />);
    const cardiac = link("Cardiac").closest("li");
    expect(cardiac).not.toBeNull();
    expect(within(cardiac!).getByRole("link", { name: "Heart failure" })).toBeInTheDocument();
    expect(within(cardiac!).queryByRole("link", { name: "Respiratory" })).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: "all" } as const, "All content"],
    [{ kind: "unfiled" } as const, "Unfiled"],
    [{ kind: "folder", id: "f3" } as const, "Heart failure"],
  ])("marks the open view as the current page: %j", (view, current) => {
    render(<FolderTree bankId={BANK} folders={folders} view={view} />);
    for (const element of within(tree()).getAllByRole("link")) {
      if (element.textContent === current) {
        expect(element).toHaveAttribute("aria-current", "page");
      } else {
        expect(element).not.toHaveAttribute("aria-current");
      }
    }
  });

  it("says there are no folders yet", () => {
    render(<FolderTree bankId={BANK} folders={[]} view={{ kind: "all" }} />);
    expect(within(tree()).getByText("No folders yet.")).toBeInTheDocument();
  });
});
