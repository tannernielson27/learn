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
  it("an empty quiz links to writing its first question", () => {
    expect(bankItemsEmpty(view())).toEqual({
      heading: "No questions yet",
      action: { href: `/author/banks/${BANK}/new`, label: "Write the first question" },
    });
  });

  it("an empty folder says so and links back to every question", () => {
    const empty = bankItemsEmpty(view({ view: FOLDER }));
    expect(empty.heading).toBe("No questions in this folder");
    expect(empty.body).toBeUndefined();
    expect(empty.action).toEqual({ href: `/author/banks/${BANK}`, label: "All questions" });
  });

  it("an empty Not in a folder view says every question is in a folder", () => {
    const empty = bankItemsEmpty(view({ view: { kind: "unfiled" } }));
    expect(empty.heading).toBe("Every question is in a folder");
    expect(empty.action).toEqual({ href: `/author/banks/${BANK}`, label: "All questions" });
  });

  it("a search with no results says so in one line and offers to clear the search", () => {
    const empty = bankItemsEmpty(view({ filter: withFilter({ query: "heparin" }) }));
    expect(empty.heading).toBe("No questions here match the search");
    expect(empty.body).toBeUndefined();
    expect(empty.action).toEqual({ href: `/author/banks/${BANK}`, label: "Clear search" });
  });

  it("a tag filter with no results names tags, or filters once warnings are on", () => {
    const tagged = bankItemsEmpty(view({ filter: withFilter({ tags: ["Cardiac"] }) }));
    expect(tagged.heading).toBe("No questions here carry every tag");
    expect(tagged.action).toEqual({ href: `/author/banks/${BANK}`, label: "Clear filters" });
    expect(bankItemsEmpty(view({ filter: withFilter({ warnings: true }) })).heading).toBe(
      "No questions here match every filter",
    );
  });

  it("the Archived view says what it holds", () => {
    const empty = bankItemsEmpty(view({ filter: withFilter({ status: "archived" }) }));
    expect(empty.heading).toBe("No archived questions here");
    expect(empty.action).toBeUndefined();
  });

  it("a search inside the Archived view reads as a search", () => {
    const empty = bankItemsEmpty(
      view({ filter: withFilter({ status: "archived", query: "heparin" }) }),
    );
    expect(empty.heading).toBe("No questions here match the search");
  });

  it("a page past the end says so first", () => {
    const empty = bankItemsEmpty(view({ page: 3, filter: withFilter({ query: "heparin" }) }));
    expect(empty.heading).toBe("No questions on this page");
    expect(empty.action).toBeUndefined();
  });
});

describe("bankCaseStudiesEmpty (#266)", () => {
  it("an empty quiz says so in one line; the form below needs no link", () => {
    expect(bankCaseStudiesEmpty(view())).toEqual({ heading: "No case studies yet" });
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

  it("a folder and Not in a folder each say so; the questions section above carries the link back", () => {
    const folder = bankCaseStudiesEmpty(view({ view: FOLDER }));
    expect(folder.heading).toBe("No case studies in this folder");
    expect(folder.action).toBeUndefined();
    expect(bankCaseStudiesEmpty(view({ view: { kind: "unfiled" } })).heading).toBe(
      "Every case study is in a folder",
    );
  });
});
