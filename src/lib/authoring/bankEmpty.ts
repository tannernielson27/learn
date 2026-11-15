import type { EmptyStateAction, EmptyStateContent } from "@/lib/emptyState";
import { isSearching, NO_BANK_FILTER, NO_SEARCH, type BankFilter } from "./bankSearch";
import type { FolderView } from "./folders";
import { bankViewHref, isFiltering, withoutTags } from "./tagFilter";

/**
 * What an empty list on the quiz page says. `noResults` when a search or a filter hid everything
 * there is (#563): one status line and the way to clear it, not a first-use heading.
 */
export type BankEmptyContent = EmptyStateContent & { readonly noResults?: true };

/** What the quiz page is showing when a list comes back empty. */
export interface BankEmptyView {
  readonly bankId: string;
  readonly view: FolderView;
  readonly filter: BankFilter;
  readonly page: number;
}

/** The Archived view is the status filter set to archived, with no words or type on top. */
const onlyArchived = (filter: BankFilter): boolean =>
  filter.status === "archived" && !filter.query && !filter.type;

/**
 * A quiz with nothing in it yet. The lists fall back to these when a page passes them no reason of
 * its own, so the words are written once.
 */
export const NO_QUESTIONS_YET: EmptyStateContent = { heading: "No questions yet" };
export const NO_CASE_STUDIES_YET: EmptyStateContent = { heading: "No case studies yet" };

/** Ways to fill an empty quiz, beyond writing a question: where they are on its page (#563). */
export interface EmptyQuizSteps {
  /** Import with AI, where it is on for the deployment and the workspace. */
  readonly aiImport?: EmptyStateAction;
  /** The side panel's New case study form. */
  readonly caseStudy?: EmptyStateAction;
}

/** The empty quiz's other first steps, from what the page offers. */
export function emptyQuizSteps({
  bankId,
  aiImport,
  caseStudyHref,
}: {
  bankId: string;
  aiImport: boolean;
  caseStudyHref: string;
}): EmptyQuizSteps {
  return {
    // Not "Import with AI": that is the side panel's link, and two links should not share a name.
    ...(aiImport
      ? {
          aiImport: {
            href: `/author/banks/${bankId}/ai-import`,
            label: "Import questions with AI",
          },
        }
      : {}),
    caseStudy: { href: caseStudyHref, label: "Start a case study" },
  };
}

/** The same view with the search taken off, keeping the folder and any tag filter. */
const clearSearch = ({ bankId, view, filter }: BankEmptyView): EmptyStateAction => ({
  href: bankViewHref(bankId, view, { ...filter, ...NO_SEARCH }),
  label: "Clear search",
});

/**
 * What an empty question list says on the quiz page (#266), most specific reason first. One line
 * and one action each (#412): the line says why the list is empty, and the action is the way out.
 * A page past the end has the pager's First page link beside it, and the Archived view has nothing
 * to do next, so neither carries an action.
 */
export function bankItemsEmpty(empty: BankEmptyView, steps: EmptyQuizSteps = {}): BankEmptyContent {
  const { bankId, view, filter, page } = empty;
  if (page > 1) return { heading: "No questions on this page" };
  if (isFiltering(filter)) {
    return {
      heading: filter.warnings
        ? "No questions here match every filter"
        : "No questions here carry every tag",
      action: { href: bankViewHref(bankId, view, withoutTags(filter)), label: "Clear filters" },
      noResults: true,
    };
  }
  if (onlyArchived(filter)) return { heading: "No archived questions here" };
  if (isSearching(filter)) {
    return {
      heading: "No questions here match the search",
      action: clearSearch(empty),
      noResults: true,
    };
  }
  // "All questions" while a quiz still has folders of its own; #417 retires them.
  const allQuestions = {
    href: bankViewHref(bankId, { kind: "all" }, NO_BANK_FILTER),
    label: "All questions",
  };
  if (view.kind === "folder") {
    return { heading: "No questions in this folder", action: allQuestions };
  }
  if (view.kind === "unfiled") {
    return { heading: "Every question is in a folder", action: allQuestions };
  }
  return {
    ...NO_QUESTIONS_YET,
    // Not "New question": that is the page's own button, and two links should not share a name.
    action: { href: `/author/banks/${bankId}/new`, label: "Write the first question" },
    ...(steps.aiImport ? { more: [steps.aiImport] } : {}),
  };
}

/**
 * What an empty case study list says on the quiz page (#266). Case studies carry no tags or type,
 * so the page shows its own note for those filters instead of this. The form that starts one is in
 * the side panel, which a phone draws under everything, so an empty quiz links to it (#563).
 */
export function bankCaseStudiesEmpty(
  empty: BankEmptyView,
  steps: EmptyQuizSteps = {},
): BankEmptyContent {
  const { view, filter } = empty;
  if (filter.query) {
    return {
      heading: "No case study titles match the search",
      action: clearSearch(empty),
      noResults: true,
    };
  }
  if (onlyArchived(filter)) return { heading: "No archived case studies here" };
  if (isSearching(filter)) {
    return {
      heading: "No case studies here have that status",
      action: clearSearch(empty),
      noResults: true,
    };
  }
  if (view.kind === "folder") return { heading: "No case studies in this folder" };
  if (view.kind === "unfiled") return { heading: "Every case study is in a folder" };
  return steps.caseStudy
    ? { ...NO_CASE_STUDIES_YET, action: steps.caseStudy }
    : NO_CASE_STUDIES_YET;
}
