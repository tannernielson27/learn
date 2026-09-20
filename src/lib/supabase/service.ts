import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readSupabasePublicEnv } from "./env";

const SECRET_VAR = "SUPABASE_SECRET_KEY";

interface RawSecret {
  secretKey: string | undefined;
}

/**
 * Reads the secret key. It is server-only by construction: the name carries no NEXT_PUBLIC_
 * prefix, so Next replaces `process.env.SUPABASE_SECRET_KEY` with undefined in anything that ends
 * up in a browser bundle rather than inlining the value.
 */
export function readSupabaseSecretKey(
  raw: RawSecret = { secretKey: process.env.SUPABASE_SECRET_KEY },
): string {
  const secretKey = raw.secretKey?.trim();
  if (!secretKey) {
    throw new Error(
      `${SECRET_VAR} is not set. See .env.example; it is required to join a session.`,
    );
  }
  if (secretKey.startsWith("sb_publishable_")) {
    throw new Error(`${SECRET_VAR} holds a publishable key, which cannot resolve a join code.`);
  }
  return secretKey;
}

/**
 * A Supabase client that acts as the service role, for the one thing row level security cannot
 * express: a person who has not signed in turning a join code into a session id.
 *
 * It bypasses RLS, so it is only ever used to call functions that do their own checking —
 * `resolve_session_code` is granted to this role and to nobody else. Never hand this client a
 * table read on behalf of a student, and never create one outside a Server Function or route
 * handler. Sessions are not persisted: there is no user to keep signed in.
 */
export function createSupabaseServiceClient() {
  const { url } = readSupabasePublicEnv();
  return createClient<Database>(url, readSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
