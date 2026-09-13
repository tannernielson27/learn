import type { NextRequest } from "next/server";
import { scoreResponse } from "@/lib/authoring/scoreRoute";

/** Scores a response to a published item on the server. See scoreResponse. */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/author/items/[itemId]/play/score">,
): Promise<Response> {
  const { itemId } = await context.params;
  return scoreResponse(request, itemId);
}
