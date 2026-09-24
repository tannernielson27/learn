import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assignSource } from "@/app/author/assignments/actions";
import { AssignPanel } from "@/components/assignments/AssignPanel";
import { assignmentPath } from "@/lib/assignments/assignments";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { listClasses } from "@/lib/supabase/classes";
import { readPracticeExposure } from "@/lib/supabase/practiceShares";

export const metadata: Metadata = { title: "Assign a case study" };

/** Assign a case study to a class (#207). Only a published one can be: the database refuses. */
export default async function AssignCaseStudyPage({
  params,
}: PageProps<"/author/case-studies/[caseStudyId]/assign">) {
  const { caseStudyId } = await params;
  const source = { kind: "case_study", id: caseStudyId } as const;
  const { supabase } = await requireAuthor(assignmentPath(source));
  if (!isUuid(caseStudyId)) notFound();

  const { data: caseStudy } = await supabase
    .from("case_studies")
    .select("id, title")
    .eq("id", caseStudyId)
    .maybeSingle();
  if (!caseStudy) notFound();
  const [classes, exposure] = await Promise.all([
    listClasses(supabase),
    readPracticeExposure(supabase, source),
  ]);

  return (
    <AssignPanel
      sourceName={caseStudy.title}
      backHref={`/author/case-studies/${caseStudy.id}`}
      backLabel="Back to case study"
      classes={classes}
      exposure={exposure}
      action={assignSource.bind(null, source)}
    />
  );
}
