import Link from "next/link";
import type { ItemSummary } from "@/lib/authoring/banks";
import { formatEdited } from "@/lib/authoring/format";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";

export interface ItemListProps {
  items: readonly ItemSummary[];
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

export function ItemList({ items }: ItemListProps) {
  if (items.length === 0) {
    return <p className="text-ink-2">No items in this bank yet. Choose New item to write one.</p>;
  }

  return (
    <ul aria-label="Items" className="flex flex-col divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/author/items/${item.id}`}
            className="tap-target flex flex-col gap-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className={item.stemExcerpt ? "text-ink-1" : "text-ink-2 italic"}>
              {item.stemExcerpt || "Untitled item"}
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{typeLabel(item.type)}</span>
              <span>{STATUS_LABELS[item.status]}</span>
              <span>{formatEdited(item.updatedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
