import {
  EMAIL_UNCONFIRMED_KEY,
  type EndEarlierAccessDeps,
  type MarkConfirmedDeps,
} from "@/lib/auth/emailConfirmation";
import type { createSupabaseServerClient } from "./server";
import { createSupabaseServiceClient } from "./service";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The account this browser is signed in to, verified, or null. Never throws. */
export async function signedInUserId(supabase: ServerClient): Promise<string | null> {
  try {
    const sub = (await supabase.auth.getClaims()).data?.claims?.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * `markEmailConfirmed`'s three calls, for the cookie client an emailed link or code has just
 * signed in. The service client is made only if there is a key to remove, which for every account
 * but a new password sign-up there is not.
 */
export function confirmedDeps(supabase: ServerClient): MarkConfirmedDeps {
  return {
    claims: async () => (await supabase.auth.getClaims()).data?.claims,
    clear: (userId) =>
      createSupabaseServiceClient().auth.admin.updateUserById(userId, {
        // Null removes the one key; Supabase Auth leaves the rest of app_metadata as it is.
        app_metadata: { [EMAIL_UNCONFIRMED_KEY]: null },
      }),
    refresh: () => supabase.auth.refreshSession(),
  };
}

/**
 * `endEarlierAccess`'s two calls, both on the cookie client an emailed link or code has just
 * signed in: the account changes its own password, and signs out every session but this one.
 */
export function earlierAccessDeps(supabase: ServerClient): EndEarlierAccessDeps {
  return {
    replacePassword: (password) => supabase.auth.updateUser({ password }),
    signOutOthers: () => supabase.auth.signOut({ scope: "others" }),
  };
}
