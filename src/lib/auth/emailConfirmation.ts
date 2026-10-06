/**
 * An account made with a password on a class invite page is let in at once, before anyone has
 * shown the address is theirs. Until they open a link or type a code sent to it, the account
 * carries this key in `app_metadata`, which only the service role can write. Nothing is refused
 * to such an account; the student home just asks, and the answer is what makes "Forgot your
 * password?" able to reach them.
 */
export const EMAIL_UNCONFIRMED_KEY = "learn_email_unconfirmed";

interface Claims {
  sub?: unknown;
  app_metadata?: unknown;
  [claim: string]: unknown;
}

/** Whether these verified token claims belong to an account that has not confirmed its address. */
export function isEmailUnconfirmed(claims: Claims | null | undefined): boolean {
  const metadata = claims?.app_metadata;
  if (typeof metadata !== "object" || metadata === null) return false;
  return (metadata as Record<string, unknown>)[EMAIL_UNCONFIRMED_KEY] === true;
}

/** What `markEmailConfirmed` needs, injected so it can be tested. */
export interface MarkConfirmedDeps {
  /** The verified claims of the session an emailed link or code has just made. */
  claims(): Promise<Claims | null | undefined>;
  /** Removes the key with the service role: `auth.admin.updateUserById`, the key set to null. */
  clear(userId: string): Promise<{ error: unknown }>;
  /** `supabase.auth.refreshSession()`, so this browser's token stops carrying the key. */
  refresh(): Promise<{ error: unknown }>;
}

/**
 * Called once an emailed link or code has signed someone in: that is the proof the address is
 * theirs. Does nothing for an account that was never marked. Never throws and never blocks the
 * sign-in it follows: a failure is logged, and the person is simply asked again later.
 */
export async function markEmailConfirmed(deps: MarkConfirmedDeps): Promise<void> {
  try {
    const claims = await deps.claims();
    if (!isEmailUnconfirmed(claims) || typeof claims?.sub !== "string") return;
    const cleared = await deps.clear(claims.sub);
    if (cleared.error) {
      const { status, code } = cleared.error as { status?: number; code?: string };
      console.error("[account] an address could not be marked confirmed", { status, code });
      return;
    }
    await deps.refresh();
  } catch (error) {
    console.error("[account] marking an address confirmed failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}
