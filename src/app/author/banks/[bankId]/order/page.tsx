import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizOrderEditor } from "@/components/authoring/QuizOrderEditor";
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
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/author/banks/${bank.id}`}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          {bank.name}
        </Link>
      </p>
      <h1 className="mb-2 font-read text-3xl text-ink-1">Change order</h1>
      <p className="mb-6 max-w-prose text-ink-2">
        Students meet the questions and case studies in this order. Move one with its arrows or drag
        it, then save.
      </p>
      {!read.ok ? (
        <p role="alert" className="text-sm text-incorrect">
          {read.error}
        </p>
      ) : read.entries.length < 2 ? (
        <p className="text-ink-2">
          {read.entries.length === 0
            ? "This quiz has no questions or case studies to put in order yet."
            : "This quiz has one question or case study, so there is no order to change yet."}
        </p>
      ) : (
        <QuizOrderEditor entries={read.entries} action={saveQuizOrderAction.bind(null, bank.id)} />
      )}
    </>
  );
}
