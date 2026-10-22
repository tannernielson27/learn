import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { libraryRail } from "@/lib/authoring/libraryFolders";
import { LibraryRail } from "./LibraryRail";

const MED_SURG = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e01";
const WEEK_1 = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e02";
const rows = [
  { id: MED_SURG, parentId: null, name: "Med-Surg", quizCount: 2 },
  { id: WEEK_1, parentId: MED_SURG, name: "Week 1", quizCount: 1 },
];

describe("LibraryRail", () => {
  it("is one list of the views and folders, the open one marked as the page", () => {
    render(<LibraryRail entries={libraryRail(rows, { kind: "folder", id: MED_SURG })} />);
    const nav = screen.getByRole("navigation", { name: "Library folders" });
    const list = within(nav).getByRole("list", { name: "Folders" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/author?folder=all",
      "/author",
      `/author?folder=${MED_SURG}`,
      `/author?folder=${WEEK_1}`,
    ]);
    expect(within(list).getByRole("link", { name: /^Med-Surg/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(list).getByRole("link", { name: "All quizzes" })).not.toHaveAttribute(
      "aria-current",
    );
    // The count is read with its word, not as a bare number.
    expect(within(list).getByRole("link", { name: /^Med-Surg/ })).toHaveTextContent(
      "Med-Surg2 quizzes",
    );
  });
});
