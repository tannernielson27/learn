import { safeNextPath } from "./nextPath";

export interface VerifyOtpParams {
  token_hash: string;
  type: "email";
}

/** The slice of `supabase.auth.verifyOtp` this step needs; injected so it can be tested. */
export type VerifyOtp = (params: VerifyOtpParams) => Promise<{ error: unknown }>;

/** The three values a sign-in link carries, as a query string or a form hands them over. */
export interface ConfirmFields {
  token_hash?: unknown;
  type?: unknown;
  next?: unknown;
}

export type ReadConfirmLink =
  { ok: true; tokenHash: string; next: string } | { ok: false; failed: string };

const MAX_TOKEN_HASH_LENGTH = 512;

/** A single string, or null: a repeated query value or a file in a form is not a link. */
function single(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Back to sign-in with a generic reason, never Supabase's message, and the safe `next` kept. */
function failedPath(next: string): string {
  return `/sign-in?${new URLSearchParams({ error: "link", next })}`;
}

/**
 * Reads a sign-in link without using it. `/auth/confirm` renders a button from this (#305), and
 * only the button's post spends the token.
 */
export function readConfirmLink(fields: ConfirmFields): ReadConfirmLink {
  const next = safeNextPath(single(fields.next));
  const tokenHash = single(fields.token_hash);
  if (!tokenHash || tokenHash.length > MAX_TOKEN_HASH_LENGTH || single(fields.type) !== "email") {
    return { ok: false, failed: failedPath(next) };
  }
  return { ok: true, tokenHash, next };
}

/**
 * Uses a sign-in link: verifies its token hash (which sets the session cookies) and answers the
 * path to send the person to. Any failure answers sign-in with a generic reason and keeps the safe
 * `next`, so a retry lands in the same place.
 */
export async function confirmLink(fields: ConfirmFields, verifyOtp: VerifyOtp): Promise<string> {
  const link = readConfirmLink(fields);
  if (!link.ok) return link.failed;

  try {
    const { error } = await verifyOtp({ token_hash: link.tokenHash, type: "email" });
    if (error) return failedPath(link.next);
  } catch {
    return failedPath(link.next);
  }
  return link.next;
}
