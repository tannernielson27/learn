import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_BANK_FILTER } from "@/lib/authoring/bankSearch";
import { ArchiveViewSwitch } from "./ArchiveViewSwitch";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = `/author/banks/${BANK}`;

describe("ArchiveViewSwitch", () => {
  it("links to current and archived content, keeping the folder, the tags and the search", () => {
    render(
      <ArchiveViewSwitch
        bankId={BANK}
        view={{ kind: "folder", id: FOLDER }}
        filter={{ ...NO_BANK_FILTER, tags: ["sepsis"], query: "lactate" }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Current or archived" });
    const current = within(nav).getByRole("link", { name: "Current" });
    const archived = within(nav).getByRole("link", { name: "Archived" });
    expect(current).toHaveAttribute("href", `${base}?folder=${FOLDER}&tag=sepsis&q=lactate`);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(archived).toHaveAttribute(
      "href",
      `${base}?folder=${FOLDER}&tag=sepsis&q=lactate&status=archived`,
    );
    expect(archived).not.toHaveAttribute("aria-current");
  });

  it("marks the Archived view as the one open, and Current drops only that status", () => {
    render(
      <ArchiveViewSwitch
        bankId={BANK}
        view={{ kind: "all" }}
        filter={{ ...NO_BANK_FILTER, status: "archived" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Current" })).toHaveAttribute("href", base);
  });

  it("keeps a draft or published status on the Current link", () => {
    render(
      <ArchiveViewSwitch
        bankId={BANK}
        view={{ kind: "all" }}
        filter={{ ...NO_BANK_FILTER, status: "published" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Current" })).toHaveAttribute(
      "href",
      `${base}?status=published`,
    );
    expect(screen.getByRole("link", { name: "Current" })).toHaveAttribute("aria-current", "page");
  });
});
