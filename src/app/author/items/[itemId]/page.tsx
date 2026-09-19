import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editorFor, storedItemOf } from "@/components/authoring/editorFor";
import { historyEntries } from "@/components/authoring/historyEntries";
import { ItemEditorWithHistory } from "@/components/authoring/ItemEditorWithHistory";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { HISTORY_LIMIT } from "@/lib/authoring/versionHistory";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { fromItemRow } from "@/lib/supabase/itemRows";

export const metadata: Metadata = { title: "Edit item" };

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;
const linkClass = "text-accent-ink underline-offset-4 hover:underline";

export default async function EditItemPage({ params }: PageProps<"/author/items/[itemId]">) {
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  // Authors may read their own org's keys (ADR 0003); RLS limits this row to the author's org.
  const { data: row } = await supabase
    .from("items")
    .select(
      "id, bank_id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring",
    )
    .eq("id", itemId)
    .maybeSingle();
  if (!row) notFound();

  // Published snapshots, newest first. They hold answer keys, so they are read only here, for the
  // item's author; RLS limits them to the author's org. One extra row says whether there are more.
  const { data: versionRows, error: versionsError } = await supabase
    .from("item_versions")
    .select("version, created_at, snapshot")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(HISTORY_LIMIT + 1);
  const versions = versionRows ?? [];

  const label = (ITEM_TYPES as readonly string[]).includes(row.type)
    ? ITEM_TYPE_LABELS[row.type as ItemType]
    : row.type;
  const editor = editorFor(row.id, row.type, storedItemOf(row));
  // Only a valid saved item exports (docs/transfer-format.md).
  const exportable = fromItemRow(row).ok;

  return (
    <>
      <p className="mb-2 flex flex-wrap gap-4 text-sm">
        <Link href={`/author/banks/${row.bank_id}`} className={linkClass}>
          Back to bank
        </Link>
        {exportable ? (
          <a href={`/author/items/${row.id}/export`} download className={linkClass}>
            Export JSON
          </a>
        ) : null}
      </p>
      <p className="eyebrow mb-1">{label}</p>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="font-read text-3xl text-ink-1">Edit item</h1>
        <p className="text-sm text-ink-2">{STATUS_LABELS[row.status]}</p>
      </div>
      {editor ? (
        <ItemEditorWithHistory
          editor={editor}
          entries={historyEntries(row, versions.slice(0, HISTORY_LIMIT))}
          truncated={versions.length > HISTORY_LIMIT}
          loadFailed={Boolean(versionsError)}
        />
      ) : (
        <p className="text-ink-2">
          The editor for this item type arrives in a later story this sprint.
        </p>
      )}
    </>
  );
}
