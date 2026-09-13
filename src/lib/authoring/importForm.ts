import { IMPORT_ERRORS, IMPORT_MAX_BYTES } from "./transfer";

export const IMPORT_FORM_ERRORS = {
  nothing: "Choose a JSON file or paste JSON to import.",
} as const;

/**
 * The text an import form sends: a chosen file first, otherwise pasted JSON. A file's size is
 * checked before it is read, so an oversized upload is never loaded into memory as text.
 */
export async function readImportText(
  formData: FormData,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_ERRORS.tooLarge };
    return { ok: true, text: await file.text() };
  }
  const pasted = formData.get("json");
  if (typeof pasted === "string" && pasted.trim().length > 0) return { ok: true, text: pasted };
  return { ok: false, error: IMPORT_FORM_ERRORS.nothing };
}
