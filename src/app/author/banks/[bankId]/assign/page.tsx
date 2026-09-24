import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assignSource } from "@/app/author/assignments/actions";
import { AssignPanel } from "@/components/assignments/AssignPanel";
import { assignmentPath } from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { listClasses } from "@/lib/supabase/classes";
import { readPracticeExposure } from "@/lib/supabase/practiceShares";

export const metadata: Metadata = { title: "Assign a bank" };

/** Assign a bank to a class (#207). */
export default async function AssignBankPage({
  params,
}: PageProps<"/author/banks/[bankId]/assign">) {
  const { bankId } = await params;
  const source = { kind: "bank", id: bankId } as const;
  const { supabase } = await requireAuthor(assignmentPath(source));
  if (!isUuid(bankId)) notFound();

  const { data: bank } = await supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();
  const [classes, exposure] = await Promise.all([
    listClasses(supabase),
    readPracticeExposure(supabase, source),
  ]);

  return (
    <AssignPanel
      sourceName={bank.name}
      backHref={`/author/banks/${bank.id}`}
      backLabel="Back to bank"
      classes={classes}
      exposure={exposure}
      action={assignSource.bind(null, source)}
    />
  );
}
