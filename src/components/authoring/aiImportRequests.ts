import {
  AI_IMPORT_UPLOAD_BUCKET,
  messageFor,
  type AiImportFailure,
} from "@/lib/authoring/aiImportUpload";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * The AI import page's two kinds of request (#345): a JSON post to its routes, and the upload of
 * a file straight to private Storage with the teacher's own session (the bucket's policy allows
 * it only at a path the server registered, while the file is pending).
 */

export async function postJson<T extends { ok: boolean }>(
  url: string,
  body: Record<string, unknown>,
): Promise<T | AiImportFailure> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await response.json()) as T | AiImportFailure;
    if (typeof parsed === "object" && parsed !== null && "ok" in parsed) return parsed;
  } catch {
    // A dropped connection or a page that is not JSON (a gateway timeout): said in words below.
  }
  return { ok: false, code: "unavailable", message: messageFor("unavailable") };
}

export async function uploadToStorage(
  path: string,
  file: File,
  contentType: string,
): Promise<boolean> {
  try {
    const { error } = await createSupabaseBrowserClient()
      .storage.from(AI_IMPORT_UPLOAD_BUCKET)
      .upload(path, file, { contentType, upsert: false });
    return !error;
  } catch {
    return false;
  }
}
