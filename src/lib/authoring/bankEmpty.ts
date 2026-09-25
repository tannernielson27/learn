import type { EmptyStateContent } from "@/lib/emptyState";
import { isSearching, NO_BANK_FILTER, type BankFilter } from "./bankSearch";
import type { FolderView } from "./folders";
import { bankViewHref, isFiltering } from "./tagFilter";

/** What the bank page is showing when a list comes back empty. */
export interface BankEmptyView {
  bankId: string;
  view: FolderView;
  filter: BankFilter;
  page: number;
}

/** The Archived view is the status filter set to archived, with no words or type on top. */
const onlyArchived = (filter: BankFilter): boolean =>
  filter.status === "archived" && !filter.query && !filter.type;

const CLEAR_SEARCH = "Try other words or another status, or clear the search above.";

/**
 * What an empty item list says on the bank page (#266), most specific reason first. A search or a
 * filter already has its own Clear control above the list, and a page past the end has the
 * pager's First page link, so neither gets a second link of the same kind here.
 */
export function bankItemsEmpty({ bankId, view, filter, page }: BankEmptyView): EmptyStateContent {
  if (page > 1) {
    return { heading: "No items on this page", body: "The list ends before this page." };
  }
  if (isFiltering(filter)) {
    return {
      heading: filter.warnings
        ? "No items here match every chosen filter"
        : "No items here carry every chosen tag",
      body: "Remove a filter, or clear them all above.",
    };
  }
  if (onlyArchived(filter)) {
    return {
      heading: "No archived items here",
      body: "Items you archive are kept here, and you can restore them.",
    };
  }
  if (isSearching(filter)) {
    return { heading: "No items here match the search", body: CLEAR_SEARCH };
  }
  const allItems = {
    href: bankViewHref(bankId, { kind: "all" }, NO_BANK_FILTER),
    label: "See all items",
  };
  if (view.kind === "folder") {
    return {
      heading: "No items in this folder",
      body: "Select items in another view and move them here, or import them into this folder.",
      action: allItems,
    };
  }
  if (view.kind === "unfiled") {
    return {
      heading: "No unfiled items",
      body: "Every item in this bank is in a folder.",
      action: allItems,
    };
  }
  return {
    heading: "No items in this bank yet",
    body: "Choose New item to write one, or import JSON below.",
    action: { href: `/author/banks/${bankId}/new`, label: "Write the first item" },
  };
}

/**
 * What an empty case study list says on the bank page (#266). Case studies carry no tags or type,
 * so the page shows its own note for those filters instead of this.
 */
export function bankCaseStudiesEmpty({ view, filter }: BankEmptyView): EmptyStateContent {
  if (filter.query) {
    return { heading: "No case study titles match the search", body: CLEAR_SEARCH };
  }
  if (onlyArchived(filter)) {
    return {
      heading: "No archived case studies here",
      body: "Case studies you archive are kept here, and you can restore them.",
    };
  }
  if (isSearching(filter)) {
    return { heading: "No case studies here have that status", body: CLEAR_SEARCH };
  }
  if (view.kind === "folder") {
    return {
      heading: "No case studies in this folder",
      body: "Select case studies in another view and move them here.",
    };
  }
  if (view.kind === "unfiled") {
    return {
      heading: "No unfiled case studies",
      body: "Every case study in this bank is in a folder.",
    };
  }
  return {
    heading: "No case studies in this bank yet",
    body: "Name one below to start building it.",
  };
}
