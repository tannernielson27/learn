import { describe, expect, it } from "vitest";
import { NO_BANK_FILTER, type BankFilter } from "./bankSearch";
import { bankCaseStudiesEmpty, bankItemsEmpty, type BankEmptyView } from "./bankEmpty";
import type { FolderView } from "./folders";

const BANK = "00000000-0000-4000-8000-0000000000b1";
const FOLDER: FolderView = { kind: "folder", id: "00000000-0000-4000-8000-0000000000f1" };

function view(overrides: Partial<BankEmptyView> = {}): BankEmptyView {
  return { bankId: BANK, view: { kind: "all" }, filter: NO_BANK_FILTER, page: 1, ...overrides };
}

const withFilter = (patch: Partial<BankFilter>): BankFilter => ({ ...NO_BANK_FILTER, ...patch });

describe("bankItemsEmpty (#266)", () => {
  it("an empty bank links to writing its first item", () => {
    expect(bankItemsEmpty(view())).toEqual({
      heading: "No items in this bank yet",
      body: "Choose New item to write one, or import JSON below.",
      action: { href: `/author/banks/${BANK}/new`, label: "Write the first item" },
    });
  });

  it("an empty folder says so and links back to every item", () => {
    const empty = bankItemsEmpty(view({ view: FOLDER }));
    expect(empty.heading).toBe("No items in this folder");
    expect(empty.action).toEqual({ href: `/author/banks/${BANK}`, label: "See all items" });
  });

  it("an empty Unfiled view says every item is in a folder", () => {
    const empty = bankItemsEmpty(view({ view: { kind: "unfiled" } }));
    expect(empty.heading).toBe("No unfiled items");
    expect(empty.action?.href).toBe(`/author/banks/${BANK}`);
  });

  it("a search with no results points at the clear control, with no second link", () => {
    const empty = bankItemsEmpty(view({ filter: withFilter({ query: "heparin" }) }));
    expect(empty.heading).toBe("No items here match the search");
    expect(empty.body).toMatch(/clear the search/);
    expect(empty.action).toBeUndefined();
  });

  it("a tag filter with no results names tags, or filters once warnings are on", () => {
    expect(bankItemsEmpty(view({ filter: withFilter({ tags: ["Cardiac"] }) })).heading).toBe(
      "No items here carry every chosen tag",
    );
    expect(bankItemsEmpty(view({ filter: withFilter({ warnings: true }) })).heading).toBe(
      "No items here match every chosen filter",
    );
  });

  it("the Archived view says what it holds", () => {
    const empty = bankItemsEmpty(view({ filter: withFilter({ status: "archived" }) }));
    expect(empty.heading).toBe("No archived items here");
    expect(empty.action).toBeUndefined();
  });

  it("a search inside the Archived view reads as a search", () => {
    const empty = bankItemsEmpty(
      view({ filter: withFilter({ status: "archived", query: "heparin" }) }),
    );
    expect(empty.heading).toBe("No items here match the search");
  });

  it("a page past the end says so first", () => {
    const empty = bankItemsEmpty(view({ page: 3, filter: withFilter({ query: "heparin" }) }));
    expect(empty.heading).toBe("No items on this page");
    expect(empty.action).toBeUndefined();
  });
});

describe("bankCaseStudiesEmpty (#266)", () => {
  it("an empty bank points at the form below", () => {
    expect(bankCaseStudiesEmpty(view())).toEqual({
      heading: "No case studies in this bank yet",
      body: "Name one below to start building it.",
    });
  });

  it("a search by words matches titles", () => {
    expect(bankCaseStudiesEmpty(view({ filter: withFilter({ query: "sepsis" }) })).heading).toBe(
      "No case study titles match the search",
    );
  });

  it("a status search says no case study has that status", () => {
    expect(
      bankCaseStudiesEmpty(view({ filter: withFilter({ status: "published" }) })).heading,
    ).toBe("No case studies here have that status");
  });

  it("the Archived view says what it holds", () => {
    expect(bankCaseStudiesEmpty(view({ filter: withFilter({ status: "archived" }) })).heading).toBe(
      "No archived case studies here",
    );
  });

  it("a folder and Unfiled each say so; the items section above carries the link back", () => {
    const folder = bankCaseStudiesEmpty(view({ view: FOLDER }));
    expect(folder.heading).toBe("No case studies in this folder");
    expect(folder.action).toBeUndefined();
    expect(bankCaseStudiesEmpty(view({ view: { kind: "unfiled" } })).heading).toBe(
      "No unfiled case studies",
    );
  });
});
