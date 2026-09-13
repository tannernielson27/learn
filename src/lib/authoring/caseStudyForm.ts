// Matches public.case_studies' check: length(title) between 1 and 200.
const MAX_TITLE = 200;

export type CaseStudyTitleResult = { ok: true; title: string } | { ok: false; error: string };

/** Reads a new case study's title from the form: trimmed, present, and within the table's limit. */
export function parseCaseStudyTitle(formData: FormData): CaseStudyTitleResult {
  const raw = formData.get("title");
  const title = typeof raw === "string" ? raw.trim() : "";
  if (title.length === 0) return { ok: false, error: "Give the case study a title." };
  if (title.length > MAX_TITLE) {
    return { ok: false, error: `Keep the title to ${MAX_TITLE} characters or fewer.` };
  }
  return { ok: true, title };
}
