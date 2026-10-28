import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archiveItemAction, restoreItemAction } from "@/app/author/archiveActions";
import { duplicateItemAction } from "@/app/author/duplicateActions";
import { ArchiveButton } from "@/components/authoring/ArchiveButton";
import { DuplicateButton } from "@/components/authoring/DuplicateButton";
import { editorFor, storedItemOf } from "@/components/authoring/editorFor";
import { historyEntries } from "@/components/authoring/historyEntries";
import { ItemEditorWithHistory } from "@/components/authoring/ItemEditorWithHistory";
import { GuardedLink } from "@/components/authoring/LeaveGuard";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { HISTORY_LIMIT } from "@/lib/authoring/versionHistory";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { textLinkClasses } from "@/components/ui/TextLink";

export const metadata: Metadata = { title: "Edit question" };

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;

export default async function EditItemPage({ params }: PageProps<"/author/items/[itemId]">) {
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  // Authors may read their own org's keys (ADR 0003); RLS limits this row to the author's org.
  const rowRead = supabase
    .from("items")
    .select(
      "id, bank_id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring",
    )
    .eq("id", itemId)
    .maybeSingle();
  // Published snapshots, newest first. They hold answer keys, so they are read only here, for the
  // item's author; RLS limits them to the author's org. One extra row says whether there are more.
  // Read beside the item, which they do not depend on, rather than after it.
  const versionsRead = supabase
    .from("item_versions")
    .select("version, created_at, snapshot")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(HISTORY_LIMIT + 1);
  const [{ data: row }, versionsResult] = await Promise.all([rowRead, versionsRead]);
  if (!row) notFound();

  const editor = editorFor(row.id, row.type, storedItemOf(row));

  // A type with no editor yet has nowhere to show them, so they are left unused.
  const { data: versionRows, error: versionsError } = editor
    ? versionsResult
    : { data: [], error: null };
  const versions = versionRows ?? [];

  const label = (ITEM_TYPES as readonly string[]).includes(row.type)
    ? ITEM_TYPE_LABELS[row.type as ItemType]
    : row.type;
  // Only a valid saved item exports (docs/transfer-format.md).
  const exportable = fromItemRow(row).ok;
  const archived = row.status === "archived";

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-x-6">
        <GuardedLink
          href={`/author/banks/${row.bank_id}`}
          className={textLinkClasses({ size: "sm" })}
        >
          <Icon icon={ChevronLeft} />
          Back to quiz
        </GuardedLink>
        {exportable ? (
          <a
            href={`/author/items/${row.id}/export`}
            download
            className={textLinkClasses({ size: "sm" })}
          >
            Export JSON
          </a>
        ) : null}
      </div>
      <p className="eyebrow mb-1">{label}</p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-read text-display text-ink-1">Edit question</h1>
        <Badge tone={row.status === "draft" ? "accent" : "neutral"}>
          {STATUS_LABELS[row.status]}
        </Badge>
        <div className="flex flex-wrap items-center gap-2">
          <DuplicateButton
            action={duplicateItemAction.bind(null, row.id)}
            label="Duplicate question"
          />
          {archived ? (
            <ArchiveButton action={restoreItemAction.bind(null, row.id)} label="Restore question" />
          ) : (
            <ArchiveButton action={archiveItemAction.bind(null, row.id)} label="Archive question" />
          )}
        </div>
      </div>
      {archived ? (
        <Notice className="mb-6 max-w-reading">Archived. Restore it to edit.</Notice>
      ) : null}
      {/* The database refuses to change archived content, so an archived item offers no editor. */}
      {archived ? null : editor ? (
        <ItemEditorWithHistory
          editor={editor}
          entries={historyEntries(row, versions.slice(0, HISTORY_LIMIT))}
          truncated={versions.length > HISTORY_LIMIT}
          loadFailed={Boolean(versionsError)}
          published={row.status === "published"}
        />
      ) : (
        <Notice>This format cannot be edited here yet.</Notice>
      )}
    </>
  );
}
