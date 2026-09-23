/**
 * Classes and their invite links (#205): the routes, the class name form and the invite token as
 * it arrives from a URL. Pure: no React, no Next, no Supabase.
 */

/** Where a signed-in student lands: their classes, and from #207 their assignments. */
export const STUDENT_HOME = "/learn";

/** The author's list of classes. */
export const CLASSES_PATH = "/author/classes";

export const CLASS_NAME_MAX = 120;

export const CLASS_NAME_ERROR = `Give the class a name of 1 to ${CLASS_NAME_MAX} characters.`;

/**
 * The most of a token taken from a URL or a form. Tokens are 32 characters; anything longer is
 * clipped, not refused, so it still goes to the database and costs exactly what an unknown token
 * costs (see `public.resolve_class_invite`).
 */
export const MAX_INVITE_TOKEN_INPUT = 64;

export function classPath(classId: string): string {
  return `${CLASSES_PATH}/${classId}`;
}

/** `/c/<token>`. The token is escaped, so a value that is not a token cannot become a path. */
export function invitePath(token: string): string {
  return `/c/${encodeURIComponent(token)}`;
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}${invitePath(token)}`;
}

/** A token as the server will look it up: a string, at most `MAX_INVITE_TOKEN_INPUT` long. */
export function clipInviteToken(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_INVITE_TOKEN_INPUT) : "";
}

export type ClassFormResult = { ok: true; name: string } | { ok: false; error: string };

/** Reads the class name form on the server. */
export function parseClassForm(formData: FormData): ClassFormResult {
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length === 0 || name.length > CLASS_NAME_MAX) {
    return { ok: false, error: CLASS_NAME_ERROR };
  }
  return { ok: true, name };
}
