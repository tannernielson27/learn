import Link from "next/link";
import type { FolderView } from "@/lib/authoring/folders";
import {
  bankViewHref,
  isFiltering,
  NO_FILTER,
  stepTagLabel,
  toggleStep,
  toggleTag,
  type TagFacets,
  type TagFilter,
} from "@/lib/authoring/tagFilter";

export interface TagFilterBarProps {
  bankId: string;
  view: FolderView;
  filter: TagFilter;
  facets: TagFacets;
}

interface Chip {
  key: string;
  label: string;
  count: number;
  selected: boolean;
  href: string;
}

const itemCount = (count: number) => (count === 1 ? "1 item" : `${count} items`);

const chipClass =
  "tap-target inline-flex items-center gap-2 rounded-sm border px-3 text-sm transition-colors duration-fast";
const idleClass = "border-line bg-surface-1 text-ink-1 hover:border-line-strong hover:bg-surface-2";
const chosenClass = "border-accent bg-accent-soft font-medium text-accent-ink hover:bg-surface-2";

function ChipLink({ chip }: { chip: Chip }) {
  return (
    <Link
      href={chip.href}
      aria-current={chip.selected ? "true" : undefined}
      // Starts with the visible label (or says it removes it), then the count in words.
      aria-label={`${chip.selected ? "Remove filter " : ""}${chip.label}, ${itemCount(chip.count)}`}
      className={`${chipClass} ${chip.selected ? chosenClass : idleClass}`}
    >
      <span className="break-words">{chip.label}</span>
      <span className="text-ink-2 tabular-nums">{chip.count}</span>
      {chip.selected ? (
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      ) : null}
    </Link>
  );
}

function ChipGroup({ id, name, chips }: { id: string; name: string; chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <p id={id} className="text-xs font-medium tracking-wide text-ink-2 uppercase">
        {name}
      </p>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.key}>
            <ChipLink chip={chip} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Filter chips for the bank page: each is a link to the same view with that tag or step added or
 * removed, so the filter lives in the URL, combines with the open folder and works without script.
 */
export function TagFilterBar({ bankId, view, filter, facets }: TagFilterBarProps) {
  const filtering = isFiltering(filter);
  const empty =
    facets.steps.length + facets.clientNeeds.length + facets.topics.length === 0 && !filtering;
  if (empty) return null;

  const tagChip = (facet: TagFacets["topics"][number]): Chip => ({
    key: facet.tag,
    label: facet.tag,
    count: facet.count,
    selected: facet.selected,
    href: bankViewHref(bankId, view, toggleTag(filter, facet.tag)),
  });
  const steps = facets.steps.map((facet): Chip => ({
    key: `step-${facet.step}`,
    label: facet.label,
    count: facet.count,
    selected: facet.selected,
    href: bankViewHref(bankId, view, toggleStep(filter, facet.step)),
  }));
  const chosen = [...(filter.step === null ? [] : [stepTagLabel(filter.step)]), ...filter.tags];

  return (
    <section
      aria-labelledby="tag-filter-heading"
      className="flex flex-col gap-4 rounded-sm border border-line p-4"
    >
      <h3 id="tag-filter-heading" className="text-sm font-medium text-ink-1">
        Filter by tag
      </h3>
      {filtering ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <p className="text-ink-1">
            {itemCount(facets.matching)} {facets.matching === 1 ? "has" : "have"} all of:{" "}
            {chosen.join(", ")}.
          </p>
          <Link
            href={bankViewHref(bankId, view, NO_FILTER)}
            className="tap-target inline-flex items-center text-accent-ink underline-offset-4 hover:underline"
          >
            Clear filters
          </Link>
        </div>
      ) : null}
      <ChipGroup id="tag-filter-steps" name="Clinical judgment step" chips={steps} />
      <ChipGroup
        id="tag-filter-needs"
        name="Client needs"
        chips={facets.clientNeeds.map(tagChip)}
      />
      <ChipGroup id="tag-filter-topics" name="Topics" chips={facets.topics.map(tagChip)} />
    </section>
  );
}
