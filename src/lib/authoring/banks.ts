import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  ITEM_PAGE_SIZE,
  NO_BANK_FILTER,
  NO_SEARCH,
  pageCount,
  pageOffset,
  type BankFilter,
  type ContentStatus,
  type ItemSearch,
} from "./bankSearch";
import type { FolderView } from "./folders";
import { hasMatch, splitHighlight, type Segment } from "./highlight";
import type { TaggedRow } from "./tagFilter";

type Client = SupabaseClient<Database>;

/** Caps so no list is unbounded; the item list pages instead (ITEM_PAGE_SIZE). */
export const BANK_LIST_LIMIT = 100;
/** How many items' tags the filter counts are read from; two columns each, so cheap. */
export const TAG_COUNT_LIMIT = 2000;
export const CASE_STUDY_LIST_LIMIT = 100;

export interface BankSummary {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
}

export interface ItemSummary {
  id: string;
  type: string;
  status: Database["public"]["Enums"]["content_status"];
  /** First line of the stem, for the list. Never the key or rationale. */
  stemExcerpt: string;
  /** The item's maximum score, or null while a draft's scoring is not set. */
  maxPoints: number | null;
  updatedAt: string;
  cjmmStep: number | null;
  tags: string[];
  /** Where a search matched, or null without a search. */
  match: ItemMatch | null;
}

/** Where a search matched an item: marked stem or item text segments, or only its rationale. */
export interface ItemMatch {
  /** The whole stem with matched words marked, when a word of the search is in it. */
  stem: Segment[] | null;
  /** A snippet of the rest of the item (options and the like), when the stem shows no match. */
  text: Segment[] | null;
  /** Matched only in the rationale; its text is never read for the list. */
  rationale: boolean;
}

/** One page of a bank's items. `total` counts every item the filter lists, on any page. */
export interface ItemPage {
  items: ItemSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export class AuthoringDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthoringDataError";
  }
}

export async function listBanks(client: Client): Promise<BankSummary[]> {
  const { data, error } = await client
    .from("item_banks")
    .select("id, name, updated_at, items(count)")
    .order("updated_at", { ascending: false })
    .limit(BANK_LIST_LIMIT);
  if (error) throw new AuthoringDataError("Item banks could not be loaded.");
  return data.map((bank) => ({
    id: bank.id,
    name: bank.name,
    updatedAt: bank.updated_at,
    itemCount: bank.items[0]?.count ?? 0,
  }));
}

/**
 * One page of a bank's items in a folder view, through `list_bank_items` under RLS: the tag filter,
 * a full-text search with its type and status, ranked by relevance when searching and by last edit
 * otherwise. The function reads content only for the stem and scoring only for its maximum;
 * answer_key and rationale text are never returned.
 */
export async function listItems(
  client: Client,
  bankId: string,
  view: FolderView = { kind: "all" },
  filter: BankFilter = NO_BANK_FILTER,
  page = 1,
): Promise<ItemPage> {
  const { data, error } = await client.rpc("list_bank_items", {
    target_bank: bankId,
    ...(filter.query ? { search: filter.query } : {}),
    ...(filter.type ? { item_type: filter.type } : {}),
    ...(filter.status ? { item_status: filter.status } : {}),
    ...(view.kind === "folder" ? { in_folder: view.id } : {}),
    unfiled_only: view.kind === "unfiled",
    with_tags: [...filter.tags],
    ...(filter.step !== null ? { with_step: filter.step } : {}),
    page_size: ITEM_PAGE_SIZE,
    page_offset: pageOffset(page, ITEM_PAGE_SIZE),
  });
  if (error) throw new AuthoringDataError("Items could not be loaded.");
  const total = data[0]?.total_count ?? 0;
  return {
    items: data.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      updatedAt: item.updated_at,
      stemExcerpt: stemExcerpt(item.stem),
      maxPoints: storedMaxPoints(item.max_points),
      cjmmStep: item.cjmm_step,
      tags: storedTags(item.tags),
      match: filter.query ? itemMatch(item) : null,
    })),
    total,
    page,
    pageCount: pageCount(total, ITEM_PAGE_SIZE),
  };
}

function marked(value: string | null): Segment[] | null {
  if (typeof value !== "string") return null;
  const segments = splitHighlight(value);
  return hasMatch(segments) ? segments : null;
}

function itemMatch(row: {
  stem_match: string | null;
  text_match: string | null;
  rationale_match: boolean | null;
}): ItemMatch {
  return {
    stem: marked(row.stem_match),
    text: marked(row.text_match),
    rationale: row.rationale_match === true,
  };
}

/** The tags and CJMM step of every item in a view, for the filter's counts. Nothing else is read. */
export async function listTaggedRows(
  client: Client,
  bankId: string,
  view: FolderView = { kind: "all" },
  search: ItemSearch = NO_SEARCH,
): Promise<TaggedRow[]> {
  // Within the search too, so the counts describe the list below them.
  const query = client.from("items").select("cjmm_step, tags").eq("bank_id", bankId);
  const searched = withStatus(matching(inView(query, view), "search_vector", search), search);
  const typed = search.type ? searched.eq("type", search.type) : searched;
  const { data, error } = await typed.limit(TAG_COUNT_LIMIT);
  if (error) throw new AuthoringDataError("Tags could not be loaded.");
  return data.map((row) => ({ cjmmStep: row.cjmm_step, tags: storedTags(row.tags) }));
}

export interface CaseStudySummary {
  id: string;
  title: string;
  status: Database["public"]["Enums"]["content_status"];
  /** How many of the six positions hold an item. */
  stepCount: number;
  updatedAt: string;
}

/** A bank's case studies in a folder view. A search matches titles only, and a status narrows. */
export async function listCaseStudies(
  client: Client,
  bankId: string,
  view: FolderView = { kind: "all" },
  search: ItemSearch = NO_SEARCH,
): Promise<CaseStudySummary[]> {
  // Only a count of steps: neither the record nor any step's key is read for the list. The key is
  // named because the case study steps migration adds a second key pair (bank) between these tables.
  const query = client
    .from("case_studies")
    .select("id, title, status, updated_at, case_study_items!case_study_items_case_org_fkey(count)")
    .eq("bank_id", bankId);
  const { data, error } = await withStatus(matching(inView(query, view), "title", search), search)
    .order("updated_at", { ascending: false })
    .limit(CASE_STUDY_LIST_LIMIT);
  if (error) throw new AuthoringDataError("Case studies could not be loaded.");
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: row.updated_at,
    stepCount: row.case_study_items[0]?.count ?? 0,
  }));
}

interface FolderFilterable<Q> {
  is(column: "folder_id", value: null): Q;
  eq(column: "folder_id", value: string): Q;
}

/** Narrows a bank's list to the open view: everything, unfiled content, or one folder's own. */
function inView<Q extends FolderFilterable<Q>>(query: Q, view: FolderView): Q {
  if (view.kind === "unfiled") return query.is("folder_id", null);
  if (view.kind === "folder") return query.eq("folder_id", view.id);
  return query;
}

/** The two columns a bank's lists search: an item's search vector, a case study's title. */
type SearchColumn = "search_vector" | "title";

interface TextSearchable<Q> {
  textSearch(
    column: SearchColumn,
    query: string,
    options: { config: string; type: "websearch" },
  ): Q;
}

/** English full-text search with web search syntax on `column`, as the list function runs it. */
function matching<Q extends TextSearchable<Q>>(
  query: Q,
  column: SearchColumn,
  search: ItemSearch,
): Q {
  return search.query
    ? query.textSearch(column, search.query, { config: "english", type: "websearch" })
    : query;
}

interface StatusFilterable<Q> {
  eq(column: "status", value: ContentStatus): Q;
}

function withStatus<Q extends StatusFilterable<Q>>(query: Q, search: ItemSearch): Q {
  return search.status ? query.eq("status", search.status) : query;
}

/** A stored tag list's strings; anything else reads as no tags. */
export function storedTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

/** A stored maximum score, or null when it is missing or not a whole number of at least one. */
export function storedMaxPoints(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

export function stemExcerpt(stem: unknown, max = 140): string {
  const value =
    stem && typeof stem === "object" && "value" in stem && typeof stem.value === "string"
      ? stem.value
      : "";
  // A link or image shows its text alone; other parentheses are text, like a copy's "(copy)".
  const plain = value
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/[*_`#>[\]!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
