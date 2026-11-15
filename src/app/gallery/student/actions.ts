"use server";

import type { JoinByCodeState } from "@/components/classes/JoinByCodeForm";
import type { JoinCodeState } from "@/components/landing/JoinCodeForm";

/**
 * The student home's two forms in `/gallery/student`, answering that they are not available here
 * (#563). Nothing is read or written: the gallery has no student behind it.
 */
const NOT_HERE = "Not in the gallery.";

export async function galleryJoinClass(): Promise<JoinByCodeState> {
  return { status: "error", error: NOT_HERE };
}

export async function galleryJoinSession(
  _previous: JoinCodeState,
  formData: FormData,
): Promise<JoinCodeState> {
  const typed = formData.get("code");
  return { status: "error", error: NOT_HERE, typed: typeof typed === "string" ? typed : "" };
}
