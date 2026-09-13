import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EhrEditorLoader } from "@/components/authoring/EhrEditorLoader";
import { ehrFormFromStored } from "@/lib/authoring/forms/ehr";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";

export const metadata: Metadata = { title: "Patient record" };

export default async function CaseStudyRecordPage({
  params,
}: PageProps<"/author/case-studies/[caseStudyId]/record">) {
  const { caseStudyId } = await params;
  if (!isUuid(caseStudyId)) notFound();

  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}/record`);
  const { data: row } = await supabase
    .from("case_studies")
    .select("id, title, ehr")
    .eq("id", caseStudyId)
    .maybeSingle();
  if (!row) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/author/case-studies/${row.id}`}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          Back to case study
        </Link>
      </p>
      <p className="eyebrow mb-1">{row.title}</p>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Patient record</h1>
      <EhrEditorLoader caseStudyId={row.id} initialValues={ehrFormFromStored(row.ehr)} />
    </>
  );
}
