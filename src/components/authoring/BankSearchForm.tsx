import Link from "next/link";
import {
  CONTENT_STATUSES,
  NO_SEARCH,
  SEARCH_MAX_LENGTH,
  STATUS_LABELS,
  isSearching,
  type BankFilter,
} from "@/lib/authoring/bankSearch";
import { UNFILED, type FolderView } from "@/lib/authoring/folders";
import { bankViewHref } from "@/lib/authoring/tagFilter";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "@/lib/ngn/labels";
import { Button } from "@/components/ui/Button";

export interface BankSearchFormProps {
  bankId: string;
  view: FolderView;
  filter: BankFilter;
}

const fieldClass =
  "tap-target w-full min-w-0 rounded-sm border border-line bg-surface-1 px-3 text-base " +
  "text-ink-1 hover:border-line-strong";

/**
 * Searches a bank's items by their words, type and status. A plain GET form to the bank page, so
 * the search lives in the URL, works without script, and keeps the open folder and tag filter.
 */
export function BankSearchForm({ bankId, view, filter }: BankSearchFormProps) {
  const folder = view.kind === "unfiled" ? UNFILED : view.kind === "folder" ? view.id : null;

  return (
    <form
      role="search"
      aria-label="Search items"
      action={`/author/banks/${bankId}`}
      method="get"
      className="flex flex-col gap-3"
    >
      {folder ? <input type="hidden" name="folder" value={folder} /> : null}
      {filter.tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}
      {filter.step !== null ? <input type="hidden" name="step" value={filter.step} /> : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="bank-search-q" className="text-sm font-medium text-ink-1">
          Search items
        </label>
        <p id="bank-search-hint" className="text-sm text-ink-2">
          Finds words in the stem, options and rationale. Use quotes for a phrase and a minus to
          leave a word out.
        </p>
        <input
          id="bank-search-q"
          type="search"
          name="q"
          defaultValue={filter.query}
          maxLength={SEARCH_MAX_LENGTH}
          autoComplete="off"
          aria-describedby="bank-search-hint"
          className={fieldClass}
        />
      </div>

      {/* The list column is narrow even on a laptop, so the buttons get their own row. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="bank-search-type" className="text-sm text-ink-1">
            Type
          </label>
          <select
            id="bank-search-type"
            name="type"
            defaultValue={filter.type ?? ""}
            className={fieldClass}
          >
            <option value="">Any type</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {ITEM_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="bank-search-status" className="text-sm text-ink-1">
            Status
          </label>
          <select
            id="bank-search-status"
            name="status"
            defaultValue={filter.status ?? ""}
            className={fieldClass}
          >
            <option value="">Any status</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary">
          Search
        </Button>
        {isSearching(filter) ? (
          <Link
            href={bankViewHref(bankId, view, { ...filter, ...NO_SEARCH })}
            className="tap-target inline-flex items-center text-sm text-accent-ink underline-offset-4 hover:underline"
          >
            Clear search
          </Link>
        ) : null}
      </div>
    </form>
  );
}
