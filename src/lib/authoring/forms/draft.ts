/** Shared by every type's Save draft check. */
export type DraftParseResult<Values> = { ok: true; values: Values } | { ok: false; error: string };

export const DRAFT_ERROR =
  "The draft could not be saved because part of it is not valid. Reload the page and try again.";
