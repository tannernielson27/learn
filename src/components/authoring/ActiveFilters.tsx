import { X } from "lucide-react";
import Link from "next/link";
import { PRESS_CLASSES } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { textLinkClasses } from "@/components/ui/TextLink";
import { STATUS_LABELS, type BankFilter } from "@/lib/authoring/bankSearch";
import type { FolderView } from "@/lib/authoring/folders";
import {
  bankViewHref,
  isFiltering,
  stepTagLabel,
  toggleStep,
  toggleTag,
  toggleWarnings,
  withoutTags,
} from "@/lib/authoring/tagFilter";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { HAS_WARNINGS, itemCount } from "./TagFilterBar";

export interface ActiveFiltersProps {
  bankId: string;
  view: FolderView;
  filter: BankFilter;
  /** How many questions in view carry every chosen tag, step and Has warnings. */
  matching: number;
}

interface Chip {
  key: string;
  label: string;
  href: string;
}

const CHIP_CLASSES =
  "tap-target inline-flex max-w-full items-center gap-2 rounded-sm border border-accent bg-accent-soft " +
  `px-3 text-sm font-medium text-accent-ink hover:bg-surface-2 ${PRESS_CLASSES}`;

/** The filters in use that the Filters panel chose: a type, a status other than Archived, tags. */
export function activeFilterCount(filter: BankFilter): number {
  return activeChips("", { kind: "all" }, filter).length;
}

function activeChips(bankId: string, view: FolderView, filter: BankFilter): Chip[] {
  const href = (next: BankFilter) => bankViewHref(bankId, view, next);
  return [
    ...(filter.type
      ? [
          {
            key: "type",
            label: ITEM_TYPE_LABELS[filter.type],
            href: href({ ...filter, type: null }),
          },
        ]
      : []),
    // Archived is the Current or archived switch, not a filter to take off.
    ...(filter.status && filter.status !== "archived"
      ? [
          {
            key: "status",
            label: STATUS_LABELS[filter.status],
            href: href({ ...filter, status: null }),
          },
        ]
      : []),
    ...(filter.step !== null
      ? [
          {
            key: "step",
            label: stepTagLabel(filter.step),
            href: href(toggleStep(filter, filter.step)),
          },
        ]
      : []),
    ...filter.tags.map((tag) => ({
      key: `tag-${tag}`,
      label: tag,
      href: href(toggleTag(filter, tag)),
    })),
    ...(filter.warnings
      ? [{ key: "warnings", label: HAS_WARNINGS, href: href(toggleWarnings(filter)) }]
      : []),
  ];
}

/**
 * What the quiz page is filtered by (#563), under the search row while the Filters panel is shut:
 * each filter a chip that takes it off, how many questions carry every chosen tag, and Clear
 * filters, which takes them all off and keeps the words searched for. Links, so it works without
 * script and the URL stays the record. Nothing when nothing is filtered.
 */
export function ActiveFilters({ bankId, view, filter, matching }: ActiveFiltersProps) {
  const chips = activeChips(bankId, view, filter);
  if (chips.length === 0) return null;
  const tagged = isFiltering(filter);
  const chosenTags = [
    ...(filter.step === null ? [] : [stepTagLabel(filter.step)]),
    ...filter.tags,
    ...(filter.warnings ? [HAS_WARNINGS] : []),
  ];
  const cleared: BankFilter = {
    ...withoutTags(filter),
    type: null,
    status: filter.status === "archived" ? filter.status : null,
  };
  return (
    <section aria-label="Active filters" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ul className="flex max-w-full flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip.key} className="max-w-full">
              <Link
                href={chip.href}
                aria-label={`Remove filter ${chip.label}`}
                className={CHIP_CLASSES}
              >
                <span className="min-w-0 break-words">{chip.label}</span>
                <Icon icon={X} className="size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={bankViewHref(bankId, view, cleared)}
          className={textLinkClasses({ size: "sm" })}
        >
          Clear filters
        </Link>
      </div>
      {tagged ? (
        <p className="text-sm text-ink-2">
          {itemCount(matching)} {matching === 1 ? "has" : "have"} all of: {chosenTags.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
