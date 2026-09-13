"use client";

import dynamic from "next/dynamic";
import { saveCaseStudyRecord } from "@/app/author/case-studies/[caseStudyId]/actions";
import type { EhrFormValues } from "@/lib/authoring/forms/ehr";

// The editor and the record schema load only on the record page.
const EhrEditor = dynamic(() => import("./EhrEditor").then((module) => module.EhrEditor), {
  ssr: false,
  loading: () => <p className="text-ink-2">Loading the editor…</p>,
});

export interface EhrEditorLoaderProps {
  caseStudyId: string;
  initialValues: EhrFormValues;
}

/** A case study's record editor, saving through the case study's server action. */
export function EhrEditorLoader({ caseStudyId, initialValues }: EhrEditorLoaderProps) {
  return (
    <EhrEditor
      initialValues={initialValues}
      onSave={(values) => saveCaseStudyRecord(caseStudyId, values)}
    />
  );
}
