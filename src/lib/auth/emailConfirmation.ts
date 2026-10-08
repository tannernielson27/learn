import { choosePasswordPath } from "./accountPaths";

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

/** The account whose address has just been confirmed for the first time, or null. */
export type NewlyConfirmed = { userId: string } | null;

/**
 * Called once an emailed link or code has signed someone in: that is the proof the address is
 * theirs. Does nothing for an account that was never marked. Never throws and never blocks the
 * sign-in it follows: a failure is logged, and the person is simply asked again later.
 */
export async function markEmailConfirmed(deps: MarkConfirmedDeps): Promise<NewlyConfirmed> {
  try {
    const claims = await deps.claims();
    if (!isEmailUnconfirmed(claims) || typeof claims?.sub !== "string") return null;
    const cleared = await deps.clear(claims.sub);
    if (cleared.error) {
      const { status, code } = cleared.error as { status?: number; code?: string };
      console.error("[account] an address could not be marked confirmed", { status, code });
      return null;
    }
    await deps.refresh();
    return { userId: claims.sub };
  } catch (error) {
    console.error("[account] marking an address confirmed failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/** Whether the proof of the address arrived in a browser that was not signed in to the account. */
function confirmedElsewhere(confirmed: NewlyConfirmed, signedInBefore: string | null): boolean {
  return confirmed !== null && confirmed.userId !== signedInBefore;
}

/** What `endEarlierAccess` needs, injected so it can be tested. */
export interface EndEarlierAccessDeps {
  /** Sets the account's password with the service role: `auth.admin.updateUserById`. */
  replacePassword(userId: string, password: string): Promise<{ error: unknown }>;
  /** `supabase.auth.signOut({ scope: "others" })`: every session but the one the link just made. */
  signOutOthers(): Promise<{ error: unknown }>;
  /** For tests; defaults to 32 random bytes. */
  randomPassword?: () => string;
}

/** 32 random bytes as base64url: 43 characters, inside Supabase's 72 and nobody's to guess. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function logEarlierAccess(step: string, error: unknown): void {
  const { status, code } = (error ?? {}) as { status?: number; code?: string };
  // Never the password, and never an error's message, which could quote the request.
  console.error(`[account] ${step} failed`, {
    status,
    code,
    error: error instanceof Error ? error.name : undefined,
  });
}

/**
 * Ends whatever access the account had before its address was confirmed, when the confirmation
 * came from a browser that was not signed in to it (owner decision, 2026-10-07).
 *
 * An account made with a password is let in before anyone has shown the address is theirs, so the
 * person who made it need not be the person now holding the inbox. Whoever opens the email is the
 * owner. If they are in the browser that made the account, nothing changes. If they are not, the
 * password the account was made with stops working (it is replaced with one nobody knows) and
 * every other session is signed out, so the only way in is the one the inbox's owner now has.
 * `afterConfirming` then sends them to choose a password of their own.
 *
 * Returns whether it applied. Never throws and never blocks the sign-in it follows: each step is
 * tried and a failure logged. The emailed link still signs the owner in whatever happens here.
 */
export async function endEarlierAccess(
  confirmed: NewlyConfirmed,
  signedInBefore: string | null,
  deps: EndEarlierAccessDeps,
): Promise<boolean> {
  if (!confirmed || !confirmedElsewhere(confirmed, signedInBefore)) return false;
  try {
    const password = (deps.randomPassword ?? randomPassword)();
    const replaced = await deps.replacePassword(confirmed.userId, password);
    if (replaced.error)
      logEarlierAccess("replacing an unconfirmed account's password", replaced.error);
  } catch (error) {
    logEarlierAccess("replacing an unconfirmed account's password", error);
  }
  try {
    const others = await deps.signOutOthers();
    if (others.error) logEarlierAccess("signing out an account's earlier sessions", others.error);
  } catch (error) {
    logEarlierAccess("signing out an account's earlier sessions", error);
  }
  return true;
}

/**
 * Where to send someone whose address has just been confirmed. The account was made by whoever
 * typed this address, which need not be the person now holding the inbox. If this browser was
 * already signed in to the account, it is the same person and they go where they were going. If
 * it was not, `endEarlierAccess` has just retired the account's password, and the inbox's owner is
 * sent to choose their own.
 */
export function afterConfirming(
  confirmed: NewlyConfirmed,
  signedInBefore: string | null,
  next: string,
): string {
  if (!confirmedElsewhere(confirmed, signedInBefore)) return next;
  return `${choosePasswordPath(next)}&confirmed=1`;
}
