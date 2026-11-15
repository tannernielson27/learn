import { Search } from "lucide-react";
import Link from "next/link";
import { buttonClasses, PRESS_CLASSES } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { Icon } from "@/components/ui/Icon";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import {
  sessionsHref,
  type SessionFilters,
  type SessionStatusFilter,
  type SessionWhoFilter,
} from "@/lib/live/sessionFilters";

const STATUS_OPTIONS: readonly { value: SessionStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ended", label: "Ended" },
  { value: "open", label: "In progress" },
  { value: "archived", label: "Archived" },
];

const WHO_OPTIONS: readonly { value: SessionWhoFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "mine", label: "Mine" },
];

/**
 * The Live sessions list's search and filters (#565). A plain GET form and links, so filtering
 * works without script and every state of the list has an address. Changing a filter starts the
 * list again from its first page.
 */
export function SessionFilterBar({ filters }: { filters: SessionFilters }) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <form
        action={SESSIONS_PATH}
        method="get"
        role="search"
        aria-label="Live sessions"
        className="flex gap-2"
      >
        {/* The filters ride along with a new search; the length does not. */}
        {filters.status !== "all" ? (
          <input type="hidden" name="status" value={filters.status} />
        ) : null}
        {filters.who !== "all" ? <input type="hidden" name="who" value={filters.who} /> : null}
        <label htmlFor="session-search" className="sr-only">
          Search live sessions by title
        </label>
        <div className="relative min-w-0 flex-1">
          <Icon
            icon={Search}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2"
          />
          <input
            id="session-search"
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search by title"
            autoComplete="off"
            maxLength={100}
            className={fieldClasses("h-11 pr-3 pl-10 text-base")}
          />
        </div>
        <button type="submit" className={buttonClasses({ variant: "secondary" })}>
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <FilterLinks
          label="Status"
          options={STATUS_OPTIONS}
          current={filters.status}
          hrefFor={(status) => sessionsHref({ q: filters.q, status, who: filters.who })}
        />
        <FilterLinks
          label="Whose live sessions"
          options={WHO_OPTIONS}
          current={filters.who}
          hrefFor={(who) => sessionsHref({ q: filters.q, status: filters.status, who })}
        />
      </div>
    </div>
  );
}

/** A segmented control made of links: the current choice is announced as the current page. */
function FilterLinks<V extends string>({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: readonly { value: V; label: string }[];
  current: V;
  hrefFor: (value: V) => string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="inline-flex rounded-sm border border-line bg-surface-1 p-0.5">
        {options.map((option) => {
          const selected = option.value === current;
          return (
            <li key={option.value} className="flex">
              <Link
                href={hrefFor(option.value)}
                aria-current={selected ? "page" : undefined}
                className={`tap-target inline-flex items-center rounded-sm px-3 text-sm font-medium ${PRESS_CLASSES} ${
                  selected
                    ? "bg-accent-soft text-accent-ink"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
