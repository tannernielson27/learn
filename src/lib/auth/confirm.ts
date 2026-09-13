import { safeNextPath } from "./nextPath";

export interface VerifyOtpParams {
  token_hash: string;
  type: "email";
}

/** The slice of `supabase.auth.verifyOtp` this step needs; injected so it can be tested. */
export type VerifyOtp = (params: VerifyOtpParams) => Promise<{ error: unknown }>;

const MAX_TOKEN_HASH_LENGTH = 512;

/**
 * Handles the link from the sign-in email: verifies its token hash (which sets the session
 * cookies) and returns where to send the person. Any failure goes back to sign-in with a generic
 * reason, never Supabase's message, and keeps the safe `next` so a retry lands in the same place.
 */
export async function confirmRedirect(url: URL, verifyOtp: VerifyOtp): Promise<URL> {
  const next = safeNextPath(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const failed = () => {
    const target = new URL("/sign-in", url.origin);
    target.searchParams.set("error", "link");
    target.searchParams.set("next", next);
    return target;
  };

  if (!tokenHash || tokenHash.length > MAX_TOKEN_HASH_LENGTH || type !== "email") return failed();

  try {
    const { error } = await verifyOtp({ token_hash: tokenHash, type: "email" });
    if (error) return failed();
  } catch {
    return failed();
  }
  return new URL(next, url.origin);
}
