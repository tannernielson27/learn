import Link from "next/link";
import { EmptyState, type EmptyStateContent } from "@/components/ui/EmptyState";
import type { ItemSummary } from "@/lib/authoring/banks";
import { formatEdited } from "@/lib/authoring/format";
import { excerptSegments } from "@/lib/authoring/highlight";
import { tagLabels } from "@/lib/authoring/tagFilter";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { ArchiveButton, type ArchiveButtonProps } from "./ArchiveButton";
import { Highlighted } from "./Highlighted";
import { SelectForMove } from "./SelectForMove";

export interface ItemListProps {
  items: readonly ItemSummary[];
  /** What an empty list says, under the page's Items h2; defaults to the empty-bank hint. */
  empty?: EmptyStateContent;
  /** The id of a move form: each item gets a checkbox that joins it. Without one, no selection. */
  moveFormId?: string;
  /** In the Archived view: the restore action for an item, so each row offers Restore. */
  restoreAction?: (itemId: string) => ArchiveButtonProps["action"];
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

const EMPTY_BANK: EmptyStateContent = {
  heading: "No items in this bank yet",
  body: "Choose New item to write one.",
};

export function ItemList({ items, empty = EMPTY_BANK, moveFormId, restoreAction }: ItemListProps) {
  if (items.length === 0) {
    return <EmptyState level={3} {...empty} />;
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
              {item.match?.stem ? (
                <Highlighted segments={excerptSegments(item.match.stem)} />
              ) : (
                item.stemExcerpt || "Untitled item"
              )}
            </span>
            {item.match?.text ? (
              <span className="text-sm break-words text-ink-2">
                In the item: <Highlighted segments={item.match.text} />
              </span>
            ) : null}
            {item.match?.rationale ? (
              <span className="text-sm text-ink-2">Matched in the rationale</span>
            ) : null}
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{typeLabel(item.type)}</span>
              {item.maxPoints !== null ? (
                <span>{item.maxPoints === 1 ? "1 point" : `${item.maxPoints} points`}</span>
              ) : null}
              <span>{STATUS_LABELS[item.status]}</span>
              <span>{formatEdited(item.updatedAt)}</span>
              {/* Counted on the server; the list never carries what the warnings are about. */}
              {item.warningCount > 0 ? (
                <span className="font-medium text-ink-1">
                  {item.warningCount === 1 ? "1 warning" : `${item.warningCount} warnings`}
                </span>
              ) : null}
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
          {restoreAction ? (
            <div className="flex shrink-0 items-center px-2">
              <ArchiveButton
                action={restoreAction(item.id)}
                label="Restore"
                accessibleName={`Restore ${item.stemExcerpt || "Untitled item"}`}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
