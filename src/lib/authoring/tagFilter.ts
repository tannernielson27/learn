import { CLIENT_NEEDS, isClientNeed, normalizeTag, splitTags, TAG_LIMITS } from "@/lib/ngn/tags";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { UNFILED, type FolderView } from "./folders";

/**
 * The bank page's filter, kept in the URL as `tag` (repeated), `step` and `warnings=1`: an item is
 * listed only when it carries every chosen tag, has the chosen CJMM step if one is chosen, and has
 * quality warnings when Has warnings is on.
 */
export interface TagFilter {
  tags: string[];
  step: CjmmStep | null;
  /** Has warnings: only items with quality warnings. Present only when on. */
  warnings?: true;
}

export const NO_FILTER: TagFilter = Object.freeze({ tags: [], step: null }) as TagFilter;

/** An item as the facet counts see it: its tags, CJMM step and whether it has warnings. */
export interface TaggedRow {
  tags: readonly string[];
  cjmmStep: number | null;
  hasWarnings?: boolean;
}

export interface TagFacet {
  tag: string;
  /** Items the filter would list with this tag chosen as well; for a chosen tag, those listed now. */
  count: number;
  selected: boolean;
}

export interface StepFacet {
  step: CjmmStep;
  label: string;
  count: number;
  selected: boolean;
}

export interface TagFacets {
  /** Items in the view the filter lists. */
  matching: number;
  /** Items the tags and step would list that have quality warnings. */
  withWarnings: number;
  steps: StepFacet[];
  clientNeeds: TagFacet[];
  topics: TagFacet[];
}

type Param = string | string[] | undefined;

const asList = (value: Param): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Reads the filter from search parameters. Anything unreadable or past the limits is dropped. */
export function parseTagFilter(tag: Param, step: Param, warnings?: Param): TagFilter {
  const tags = [
    ...new Set(
      asList(tag)
        .slice(0, TAG_LIMITS.count * 2)
        .map(normalizeTag)
        .filter((value) => value !== "" && value.length <= TAG_LIMITS.length),
    ),
  ].slice(0, TAG_LIMITS.count);
  const rawStep = asList(step)[0];
  const parsedStep = rawStep !== undefined && /^[1-6]$/.test(rawStep) ? Number(rawStep) : null;
  const hasWarnings = asList(warnings)[0] === "1";
  return { tags, step: parsedStep as CjmmStep | null, ...(hasWarnings ? { warnings: true } : {}) };
}

export function isFiltering(filter: TagFilter): boolean {
  return filter.tags.length > 0 || filter.step !== null || filter.warnings === true;
}

/** Adds a tag, or takes it away when chosen. Anything else the filter holds (a search) is kept. */
export function toggleTag<F extends TagFilter>(filter: F, tag: string): F {
  const tags = filter.tags.includes(tag)
    ? filter.tags.filter((chosen) => chosen !== tag)
    : [...filter.tags, tag];
  return { ...filter, tags };
}

export function toggleStep<F extends TagFilter>(filter: F, step: CjmmStep): F {
  return { ...filter, step: filter.step === step ? null : step };
}

/** Turns Has warnings on, or off when it is on. Anything else the filter holds is kept. */
export function toggleWarnings<F extends TagFilter>(filter: F): F {
  return { ...filter, warnings: filter.warnings ? undefined : true };
}

/** The filter with no tags, no step and no warnings, keeping anything else it holds. */
export function withoutTags<F extends TagFilter>(filter: F): F {
  return { ...filter, tags: [], step: null, warnings: undefined };
}

/** The search fields of the bank page's URL (see bankSearch.ts), each optional here. */
interface SearchParams {
  query?: string;
  type?: string | null;
  status?: string | null;
}

/**
 * The bank page for a folder view, a filter and a page, all kept in the URL: `folder`, `tag`
 * (repeated), `step`, `warnings`, `q`, `type`, `status` and `page`, each only when set.
 */
export function bankViewHref(
  bankId: string,
  view: FolderView,
  filter: TagFilter & SearchParams,
  page = 1,
): string {
  const params = new URLSearchParams();
  if (view.kind === "unfiled") params.set("folder", UNFILED);
  if (view.kind === "folder") params.set("folder", view.id);
  for (const tag of filter.tags) params.append("tag", tag);
  if (filter.step !== null) params.set("step", String(filter.step));
  if (filter.warnings) params.set("warnings", "1");
  if (filter.query) params.set("q", filter.query);
  if (filter.type) params.set("type", filter.type);
  if (filter.status) params.set("status", filter.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/author/banks/${bankId}${query ? `?${query}` : ""}`;
}

const isStep = (value: number | null): value is CjmmStep =>
  value !== null && Number.isInteger(value) && value >= 1 && value <= 6;

/** "Step N: name" for a CJMM step, as it reads among an item's tags. */
export const stepTagLabel = (step: CjmmStep): string => `Step ${step}: ${CJMM_STEP_LABELS[step]}`;

/** An item's tags as read: its CJMM step first, then client needs in fixed order, then topics. */
export function tagLabels(cjmmStep: number | null, tags: readonly string[]): string[] {
  const { clientNeeds, topics } = splitTags(tags);
  return [...(isStep(cjmmStep) ? [stepTagLabel(cjmmStep)] : []), ...clientNeeds, ...topics];
}

const matches = (row: TaggedRow, filter: TagFilter): boolean =>
  (filter.step === null || row.cjmmStep === filter.step) &&
  (!filter.warnings || row.hasWarnings === true) &&
  filter.tags.every((tag) => row.tags.includes(tag));

/**
 * What each chip would leave listed. Tags combine with AND, so an unchosen tag counts the items the
 * filter lists that also carry it; an item has one step, so another step counts as a swap. A
 * chip that would leave nothing is left out, except a chosen one, which stays so it can be removed.
 */
export function tagFacets(rows: readonly TaggedRow[], filter: TagFilter): TagFacets {
  const listed = rows.filter((row) => matches(row, filter));
  const tagCounts = new Map<string, number>();
  for (const row of listed) {
    for (const tag of new Set(row.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const facetOf = (tag: string): TagFacet => {
    const selected = filter.tags.includes(tag);
    return { tag, count: selected ? listed.length : (tagCounts.get(tag) ?? 0), selected };
  };
  const present = [...new Set([...filter.tags, ...tagCounts.keys()])];

  const clientNeeds = CLIENT_NEEDS.filter((need) => present.includes(need)).map(facetOf);
  const topics = present
    .filter((tag) => !isClientNeed(tag))
    .map(facetOf)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const withTags = rows.filter((row) => matches(row, { ...filter, step: null }));
  const steps = ([1, 2, 3, 4, 5, 6] as const)
    .map((step) => ({
      step,
      label: stepTagLabel(step),
      count: withTags.filter((row) => row.cjmmStep === step).length,
      selected: filter.step === step,
    }))
    .filter((facet) => facet.count > 0 || facet.selected);

  const withWarnings = rows.filter(
    (row) => row.hasWarnings === true && matches(row, { ...filter, warnings: undefined }),
  ).length;

  return { matching: listed.length, withWarnings, steps, clientNeeds, topics };
}
