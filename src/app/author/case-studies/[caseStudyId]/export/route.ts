import { exportDownload } from "@/lib/authoring/exportRoute";

/** Downloads a case study with its record and six steps as learn.v1 JSON. See exportDownload. */
export async function GET(
  request: Request,
  context: RouteContext<"/author/case-studies/[caseStudyId]/export">,
): Promise<Response> {
  const { caseStudyId } = await context.params;
  return exportDownload(request, "caseStudy", caseStudyId);
}
