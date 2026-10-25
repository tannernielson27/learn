import { sessionPodiumResponse } from "@/lib/supabase/podiumRoute";

/** The top 5 for the projector when a live session ends. See sessionPodiumResponse. */
export async function GET(
  request: Request,
  context: RouteContext<"/live/[sessionId]/podium">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return sessionPodiumResponse(request, sessionId);
}
