import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayItem } from "@/components/authoring/PlayItem";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { toKeylessItem } from "@/lib/ngn/submit";
import { fromItemRow } from "@/lib/supabase/itemRows";

export const metadata: Metadata = { title: "Play item" };

const linkClass = "text-accent-ink underline-offset-4 hover:underline";

export default async function PlayItemPage({ params }: PageProps<"/author/items/[itemId]/play">) {
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const { supabase } = await requireAuthor(`/author/items/${itemId}/play`);
  const { data: row } = await supabase
    .from("items")
    .select(
      "id, bank_id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring",
    )
    .eq("id", itemId)
    .maybeSingle();
  // Only published items can be played; a draft reads as not found here.
  if (!row || row.status !== "published") notFound();

  const stored = fromItemRow(row);

  return (
    <>
      <p className="mb-2 flex flex-wrap gap-4 text-sm">
        <Link href={`/author/banks/${row.bank_id}`} className={linkClass}>
          Back to bank
        </Link>
        <Link href={`/author/items/${row.id}`} className={linkClass}>
          Edit item
        </Link>
      </p>
      {stored.ok ? (
        <>
          <p className="eyebrow mb-1">{ITEM_TYPE_LABELS[stored.value.type]}</p>
          <h1 className="mb-6 font-read text-3xl text-ink-1">Play item</h1>
          {/* The only item data that reaches the browser: no key, no rationale (ADR 0003). */}
          <PlayItem itemId={row.id} item={toKeylessItem(stored.value)} />
        </>
      ) : (
        <>
          <h1 className="mb-2 font-read text-3xl text-ink-1">Play item</h1>
          <p className="text-ink-2">
            This item has a problem and cannot be played. Open it in the editor to fix it.
          </p>
        </>
      )}
    </>
  );
}
