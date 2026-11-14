import { parseDisplayName } from "./displayName";
import { joinPath } from "./routes";
import { isSessionCode, normalizeSessionCode } from "./sessionCode";

/**
 * Reads the join form on the server. The browser's own `required` and `maxlength` are a
 * convenience; this is the check, because a form can be posted without one.
 *
 * Pure: no React, no Next, no Supabase.
 */

export const JOIN_CODE_ERROR = "Enter the six-character join code on the screen.";

/**
 * What the join action (`src/app/join/actions.ts`) refuses with. Here, not there, because a
 * `"use server"` file may export only functions, and the wording is checked against
 * docs/glossary.md with the rest of the live session's copy.
 *
 * `unknown` and `rateLimited` say no more than they did before the rename: neither tells a
 * guesser whether a code exists, is closed or was never issued. `scripts/load-live/join.mjs`
 * matches on the first sentence of each, so change the two together.
 */
export const JOIN_REFUSALS = {
  unknown: "That join code does not match an open live session. Check it and try again.",
  rateLimited: "Too many join attempts from this network. Wait a few minutes, then try again.",
  unavailable: "Joining is not working just now. Try again in a moment.",
  full: "That live session is full.",
} as const;

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

export type JoinCodeResult =
  { ok: true; code: string; href: string } | { ok: false; error: string };

/**
 * A join code typed somewhere other than the join page itself: the landing page's own field
 * (#563), and `/join?code=…`, which is where that field's plain GET form lands without JavaScript.
 * Both send the code on to `/join/[code]`, the page a QR code opens, so a student finishes on the
 * one join screen with the code filled in and only their name to type. The same rules as the join
 * form: case, spaces and hyphens are forgiven, and nothing else is.
 */
export function readJoinCode(typed: unknown): JoinCodeResult {
  const code = normalizeSessionCode(typeof typed === "string" ? typed : "");
  if (!isSessionCode(code)) return { ok: false, error: JOIN_CODE_ERROR };
  return { ok: true, code, href: joinPath(code) };
}
