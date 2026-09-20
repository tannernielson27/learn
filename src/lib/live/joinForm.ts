import { parseDisplayName } from "./displayName";
import { isSessionCode, normalizeSessionCode } from "./sessionCode";

/**
 * Reads the join form on the server. The browser's own `required` and `maxlength` are a
 * convenience; this is the check, because a form can be posted without one.
 *
 * Pure: no React, no Next, no Supabase.
 */

export const JOIN_CODE_ERROR = "Enter the six-character code on the screen.";

/** Which field to mark and move focus to. */
export type JoinField = "code" | "displayName";

export type JoinFormResult =
  { ok: true; code: string; displayName: string } | { ok: false; field: JoinField; error: string };

export function parseJoinForm(formData: FormData): JoinFormResult {
  const typedCode = formData.get("code");
  const code = normalizeSessionCode(typeof typedCode === "string" ? typedCode : "");
  if (!isSessionCode(code)) return { ok: false, field: "code", error: JOIN_CODE_ERROR };

  const name = parseDisplayName(formData.get("displayName"));
  if (!name.ok) return { ok: false, field: "displayName", error: name.error };

  return { ok: true, code, displayName: name.value };
}
