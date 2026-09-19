import Link from "next/link";
import type { ItemSummary } from "@/lib/authoring/banks";
import { formatEdited } from "@/lib/authoring/format";
import { tagLabels } from "@/lib/authoring/tagFilter";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { SelectForMove } from "./SelectForMove";

export interface ItemListProps {
  items: readonly ItemSummary[];
  /** Shown when there are no items; defaults to the empty-bank hint. */
  emptyMessage?: string;
  /** The id of a move form: each item gets a checkbox that joins it. Without one, no selection. */
  moveFormId?: string;
}

const STATUS_LABELS: Record<ItemSummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function typeLabel(type: string): string {
  return (ITEM_TYPES as readonly string[]).includes(type)
    ? ITEM_TYPE_LABELS[type as ItemType]
    : type;
}

function TagChips({ labels }: { labels: readonly string[] }) {
  if (labels.length === 0) return null;
  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <li
          key={label}
          className="rounded-sm border border-line bg-surface-1 px-1.5 py-0.5 text-xs text-ink-2"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

export function ItemList({
  items,
  emptyMessage = "No items in this bank yet. Choose New item to write one.",
  moveFormId,
}: ItemListProps) {
  if (items.length === 0) {
    return <p className="text-ink-2">{emptyMessage}</p>;
  }

  return (
    <ul aria-label="Items" className="flex flex-col divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.id} className="flex items-stretch">
          {moveFormId ? (
            <SelectForMove
              formId={moveFormId}
              name="item"
              value={item.id}
              label={`Select ${item.stemExcerpt || "Untitled item"}`}
            />
          ) : null}
          <Link
            href={`/author/items/${item.id}`}
            className="tap-target flex min-w-0 flex-1 flex-col gap-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className={item.stemExcerpt ? "text-ink-1" : "text-ink-2 italic"}>
              {item.stemExcerpt || "Untitled item"}
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{typeLabel(item.type)}</span>
              {item.maxPoints !== null ? (
                <span>{item.maxPoints === 1 ? "1 point" : `${item.maxPoints} points`}</span>
              ) : null}
              <span>{STATUS_LABELS[item.status]}</span>
              <span>{formatEdited(item.updatedAt)}</span>
            </span>
            <TagChips labels={tagLabels(item.cjmmStep, item.tags)} />
          </Link>
          {/* Only a published item has a version to play, and the scorer only accepts those. */}
          {item.status === "published" ? (
            <Link
              href={`/author/items/${item.id}/play`}
              aria-label={`Play ${item.stemExcerpt || "Untitled item"}`}
              className="tap-target flex shrink-0 items-center px-4 text-sm font-medium text-accent-ink transition-colors duration-fast hover:bg-surface-2"
            >
              Play
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
