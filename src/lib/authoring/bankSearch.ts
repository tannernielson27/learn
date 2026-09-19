import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import type { Database } from "@/lib/supabase/database.types";
import { NO_FILTER, type TagFilter } from "./tagFilter";

export type ContentStatus = Database["public"]["Enums"]["content_status"];

export const CONTENT_STATUSES = [
  "draft",
  "published",
  "archived",
] as const satisfies readonly ContentStatus[];

/** Longer searches are cut here; the database function holds the same line. */
export const SEARCH_MAX_LENGTH = 200;
/** Items per page of the bank list. */
export const ITEM_PAGE_SIZE = 50;
/** Past this, a page number reads as the first page. */
export const MAX_PAGE = 2000;

/**
 * The bank page's search, kept in the URL as `q`, `type` and `status`: the words run through
 * Postgres full-text search over the item's text, and the type and status narrow the list.
 */
export interface ItemSearch {
  query: string;
  type: ItemType | null;
  status: ContentStatus | null;
}

/** Everything that narrows the bank's item list, besides the open folder. */
export interface BankFilter extends TagFilter, ItemSearch {}

export const NO_SEARCH: ItemSearch = Object.freeze({
  query: "",
  type: null,
  status: null,
}) as ItemSearch;

export const NO_BANK_FILTER: BankFilter = Object.freeze({
  ...NO_FILTER,
  ...NO_SEARCH,
}) as BankFilter;

type Param = string | string[] | undefined;

const first = (value: Param): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Reads the search from search parameters. Anything unknown is dropped. */
export function parseItemSearch(params: { q?: Param; type?: Param; status?: Param }): ItemSearch {
  const query = (first(params.q) ?? "")
    .slice(0, SEARCH_MAX_LENGTH * 2)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
  const type = first(params.type);
  const status = first(params.status);
  return {
    query,
    type: (ITEM_TYPES as readonly string[]).includes(type ?? "") ? (type as ItemType) : null,
    status: (CONTENT_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as ContentStatus)
      : null,
  };
}

export function isSearching(search: ItemSearch): boolean {
  return search.query !== "" || search.type !== null || search.status !== null;
}

/** Reads a page number: a whole number from 1 to MAX_PAGE, or the first page. */
export function parsePage(value: Param): number {
  const raw = first(value);
  if (raw === undefined || !/^\d{1,5}$/.test(raw)) return 1;
  const page = Number(raw);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** "6 items match: “lactate”, Matrix Multiple Choice, Published." */
export function searchSummary(total: number, search: ItemSearch): string {
  const parts = [
    ...(search.query ? [`“${search.query}”`] : []),
    ...(search.type ? [ITEM_TYPE_LABELS[search.type]] : []),
    ...(search.status ? [STATUS_LABELS[search.status]] : []),
  ];
  const count = total === 1 ? "1 item matches" : `${total} items match`;
  return `${count}: ${parts.join(", ")}.`;
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

export function pageOffset(page: number, size: number): number {
  return (page - 1) * size;
}
