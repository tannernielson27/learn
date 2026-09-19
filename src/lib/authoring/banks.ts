import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FolderView } from "./folders";
import { NO_FILTER, type TagFilter, type TaggedRow } from "./tagFilter";

type Client = SupabaseClient<Database>;

/** Caps so no list is unbounded; paging arrives with bank management in Sprint 6. */
export const BANK_LIST_LIMIT = 100;
export const ITEM_LIST_LIMIT = 200;
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

export async function listItems(
  client: Client,
  bankId: string,
  view: FolderView = { kind: "all" },
  filter: TagFilter = NO_FILTER,
): Promise<ItemSummary[]> {
  // Selects content only for the stem and scoring only for its maximum; answer_key and rationale
  // are never read here.
  const query = client
    .from("items")
    .select("id, type, status, updated_at, cjmm_step, tags, content->stem, scoring->maxPoints")
    .eq("bank_id", bankId);
  const { data, error } = await withTags(inView(query, view), filter)
    .order("updated_at", { ascending: false })
    .limit(ITEM_LIST_LIMIT);
  if (error) throw new AuthoringDataError("Items could not be loaded.");
  return data.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    updatedAt: item.updated_at,
    stemExcerpt: stemExcerpt(item.stem),
    maxPoints: storedMaxPoints(item.maxPoints),
    cjmmStep: item.cjmm_step,
    tags: storedTags(item.tags),
  }));
}

/** The tags and CJMM step of every item in a view, for the filter's counts. Nothing else is read. */
export async function listTaggedRows(
  client: Client,
  bankId: string,
  view: FolderView = { kind: "all" },
): Promise<TaggedRow[]> {
  const query = client.from("items").select("cjmm_step, tags").eq("bank_id", bankId);
  const { data, error } = await inView(query, view).limit(TAG_COUNT_LIMIT);
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

export async function listCaseStudies(
  client: Client,
  bankId: string,
  view: FolderView = { kind: "all" },
): Promise<CaseStudySummary[]> {
  // Only a count of steps: neither the record nor any step's key is read for the list. The key is
  // named because the case study steps migration adds a second key pair (bank) between these tables.
  const query = client
    .from("case_studies")
    .select("id, title, status, updated_at, case_study_items!case_study_items_case_org_fkey(count)")
    .eq("bank_id", bankId);
  const { data, error } = await inView(query, view)
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

interface TagFilterable<Q> {
  contains(column: "tags", value: string[]): Q;
  eq(column: "cjmm_step", value: number): Q;
}

/** Narrows items to those carrying every chosen tag (served by items_tags_idx) and the chosen step. */
function withTags<Q extends TagFilterable<Q>>(query: Q, filter: TagFilter): Q {
  const tagged = filter.tags.length > 0 ? query.contains("tags", filter.tags) : query;
  return filter.step === null ? tagged : tagged.eq("cjmm_step", filter.step);
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
  const plain = value
    .replace(/[*_`#>[\]()!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
