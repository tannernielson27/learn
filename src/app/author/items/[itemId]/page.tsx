import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";

export const metadata: Metadata = { title: "Edit item" };

// Placeholder: the split-pane editor with live preview replaces this in #69.
export default async function EditItemPage({ params }: PageProps<"/author/items/[itemId]">) {
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  // Reads only what the heading needs; the key stays in the database.
  const { data: item } = await supabase
    .from("items")
    .select("id, type, bank_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) notFound();

  const label = (ITEM_TYPES as readonly string[]).includes(item.type)
    ? ITEM_TYPE_LABELS[item.type as ItemType]
    : item.type;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/author/banks/${item.bank_id}`}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          Back to bank
        </Link>
      </p>
      <p className="eyebrow mb-1">{label}</p>
      <h1 className="mb-2 font-read text-3xl text-ink-1">Untitled item</h1>
      <p className="text-ink-2">The editor for this item arrives in the next story.</p>
    </>
  );
}
