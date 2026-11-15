import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayItem } from "@/components/authoring/PlayItem";
import { PageWidth } from "@/components/ui/PageWidth";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { toKeylessItem } from "@/lib/ngn/submit";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/TextLink";

export const metadata: Metadata = { title: "Play question" };

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

  // A question with a patient record plays it beside the question (PracticeCase), which needs the
  // wide width; one without stays at the reading width.
  const page = (
    <>
      <p className="mb-2 flex flex-wrap gap-4 text-sm">
        <BackLink href={`/author/banks/${row.bank_id}`}>Back to quiz</BackLink>
        <TextLink href={`/author/items/${row.id}`} size="sm">
          Edit question
        </TextLink>
      </p>
      {stored.ok ? (
        <>
          <PageHeader
            className="mb-6"
            label={ITEM_TYPE_LABELS[stored.value.type]}
            title="Play question"
          />
          {/* The only item data that reaches the browser: no key, no rationale (ADR 0003). */}
          <PlayItem itemId={row.id} item={toKeylessItem(stored.value)} />
        </>
      ) : (
        <>
          <PageHeader className="mb-2" title="Play question" />
          <p className="text-ink-2">
            This question has a problem and cannot be played. Open it in the editor to fix it.
          </p>
        </>
      )}
    </>
  );
  return stored.ok && stored.value.ehr ? <PageWidth width="wide">{page}</PageWidth> : page;
}
