import { classProgressCsvDownload } from "@/lib/classes/progressCsvRoute";

/** Downloads a class's progress grid as CSV. See classProgressCsvDownload. */
export async function GET(
  request: Request,
  context: RouteContext<"/author/classes/[classId]/progress/csv">,
): Promise<Response> {
  const { classId } = await context.params;
  return classProgressCsvDownload(request, classId);
}
