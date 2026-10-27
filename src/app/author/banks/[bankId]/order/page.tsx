import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { QuizOrderEditor } from "@/components/authoring/QuizOrderEditor";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextLink";
import { isUuid } from "@/lib/authoring/ids";
import { listQuizEntries } from "@/lib/authoring/quizOrderData";
import { requireAuthor } from "@/lib/authoring/session";
import { saveQuizOrderAction } from "../../../quizOrderActions";

export const metadata: Metadata = { title: "Change order" };

/**
 * #468: a quiz's questions and case studies in the order students meet them, moved with buttons
 * or by dragging, then saved at once. A case study's steps keep their own order on its page.
 */
export default async function QuizOrderPage({ params }: PageProps<"/author/banks/[bankId]/order">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();

  const { supabase } = await requireAuthor(`/author/banks/${bankId}/order`);
  const [{ data: bank }, read] = await Promise.all([
    supabase.from("item_banks").select("id, name").eq("id", bankId).maybeSingle(),
    listQuizEntries(supabase, bankId),
  ]);
  if (!bank) notFound();

  return (
    <ReadingWidth>
      <p className="mb-2">
        <TextLink href={`/author/banks/${bank.id}`} size="sm">
          {bank.name}
        </TextLink>
      </p>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Change order</h1>
      {!read.ok ? (
        <Notice role="alert">{read.error}</Notice>
      ) : read.entries.length < 2 ? (
        <p className="text-ink-2">
          {read.entries.length === 0 ? "Nothing to order yet." : "Add another question to reorder."}
        </p>
      ) : (
        <QuizOrderEditor entries={read.entries} action={saveQuizOrderAction.bind(null, bank.id)} />
      )}
    </ReadingWidth>
  );
}
