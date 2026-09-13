import { exportDownload } from "@/lib/authoring/exportRoute";

/** Downloads a valid item as learn.v1 JSON. See exportDownload. */
export async function GET(
  request: Request,
  context: RouteContext<"/author/items/[itemId]/export">,
): Promise<Response> {
  const { itemId } = await context.params;
  return exportDownload(request, "item", itemId);
}
