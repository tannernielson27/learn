import { ListFilter, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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
import { Button, buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { textLinkClasses } from "@/components/ui/TextLink";

export interface BankSearchFormProps {
  bankId: string;
  view: FolderView;
  filter: BankFilter;
  /** The tag panel (`TagFilterBar`), under Type and Status inside Filters. */
  tags?: ReactNode;
  /** How many filters are on, for the Filters button: "Filters, 2 on". */
  activeCount?: number;
}

/** The Filters panel's id, and the name of the button that opens it. */
export const FILTERS_ID = "bank-filters";

const fieldClass = fieldClasses("min-w-0 px-3 text-base");

/**
 * Searches a bank's items by their words, type and status (#563: one compact row). The words and
 * Search are in the row; Type, Status and the tag panel are behind Filters, a panel that opens
 * under its button. It is still a plain GET form to the bank page, so the search lives in the URL,
 * works without script (the panel is the browser's own popover), and keeps the open folder and tag
 * filter. The panel's fields belong to the form while it is shut, so Search sends them too.
 */
export function BankSearchForm({
  bankId,
  view,
  filter,
  tags,
  activeCount = 0,
}: BankSearchFormProps) {
  const folder = view.kind === "unfiled" ? UNFILED : view.kind === "folder" ? view.id : null;

  return (
    <form
      role="search"
      aria-label="Search questions"
      action={`/author/banks/${bankId}`}
      method="get"
      className="flex flex-col gap-1"
    >
      {folder ? <input type="hidden" name="folder" value={folder} /> : null}
      {filter.tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}
      {filter.step !== null ? <input type="hidden" name="step" value={filter.step} /> : null}
      {/* Has warnings is a link in the tag panel, not a field: carry it, or Search drops it (#578). */}
      {filter.warnings ? <input type="hidden" name="warnings" value="1" /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {/* The button beside it names the field's job as well (WCAG G167); the label is read. */}
        <label htmlFor="bank-search-q" className="sr-only">
          Search questions
        </label>
        <div className="relative flex min-w-0 flex-[1_1_14rem]">
          <Icon
            icon={Search}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2"
          />
          <input
            id="bank-search-q"
            type="search"
            name="q"
            defaultValue={filter.query}
            maxLength={SEARCH_MAX_LENGTH}
            autoComplete="off"
            aria-describedby="bank-search-hint"
            className={fieldClasses("w-full min-w-0 pr-3 pl-10 text-base")}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit">Search</Button>
          <Popover
            id={FILTERS_ID}
            align="end"
            buttonClassName={buttonClasses({ variant: "ghost" })}
            accessibleName={activeCount > 0 ? `Filters, ${activeCount} on` : undefined}
            label={
              <>
                <Icon icon={ListFilter} />
                Filters
                {activeCount > 0 ? (
                  <span className="rounded-sm bg-accent-soft px-1.5 text-sm tabular-nums">
                    {activeCount}
                  </span>
                ) : null}
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <p className="font-semibold text-ink-1">Filters</p>
              <div className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2">
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
              <div>
                <Button type="submit" variant="primary" size="sm">
                  Apply filters
                </Button>
              </div>
              {tags}
            </div>
          </Popover>
        </div>
        {isSearching(filter) ? (
          <Link
            href={bankViewHref(bankId, view, { ...filter, ...NO_SEARCH })}
            className={textLinkClasses({ size: "sm" })}
          >
            Clear search
          </Link>
        ) : null}
      </div>
      <p id="bank-search-hint" className="text-sm text-ink-2">
        Quotes find a phrase; a minus leaves a word out.
      </p>
    </form>
  );
}
