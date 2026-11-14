"use server";

import { redirect } from "next/navigation";
import type { JoinCodeState } from "@/components/landing/JoinCodeForm";
import { parseJoinCode } from "@/lib/live/joinForm";
import { joinPath } from "@/lib/live/routes";

/**
 * The landing page's join code form (#563). It reads the code with the join form's own rule
 * (`parseJoinCode`) and sends it on to `/join/[code]`, the page the QR code on the projector
 * opens, which fills the code in and asks for a name. Nothing is looked up here: whether the code
 * names an open live session is answered by the join itself, with its rate limit, as before.
 */
export async function openJoinCode(
  _previous: JoinCodeState,
  formData: FormData,
): Promise<JoinCodeState> {
  const typed = formData.get("code");
  const parsed = parseJoinCode(typed);
  if (!parsed.ok) {
    return { status: "error", error: parsed.error, typed: typeof typed === "string" ? typed : "" };
  }
  // Outside any branch, because redirect() works by throwing.
  redirect(joinPath(parsed.code));
}
