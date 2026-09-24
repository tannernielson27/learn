import type { SupabaseClient } from "@supabase/supabase-js";
import { clipInviteToken } from "@/lib/classes/classes";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export type ResolvedInvite =
  | { status: "open"; classId: string; className: string }
  | { status: "invalid" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

/**
 * Resolves an invite token with the service-role client (`resolve_class_invite` is granted to no
 * one else), counting a miss against the caller's address.
 *
 * Unlike `resolveSessionCode`, nothing is answered here without asking the database, not even a
 * token that cannot be one. An unknown, rotated and malformed token must be indistinguishable,
 * timing included (#205), and a malformed one answered locally would come back a round trip
 * sooner. The database treats all three the same: one counted miss, zero rows.
 *
 * Fails closed: a database that cannot answer has no class to join either.
 */
export async function resolveClassInvite(
  client: Client,
  token: string,
  clientIp: string | null,
): Promise<ResolvedInvite> {
  const { data, error } = await client.rpc("resolve_class_invite", {
    token: clipInviteToken(token),
    client_key: clientIp ?? undefined,
  });
  if (error) return { status: error.code === "PT429" ? "rate_limited" : "unavailable" };
  const row = data?.[0];
  if (!row) return { status: "invalid" };
  return { status: "open", classId: row.class_id, className: row.class_name };
}

export type JoinAnswer = "joined" | "instructor" | "invalid" | "rate_limited" | "unavailable";

const JOIN_ANSWERS = new Set<JoinAnswer>(["joined", "instructor", "invalid", "rate_limited"]);

/** The signed-in one-tap join, as the caller (so `auth.uid()` is who joins). */
export async function joinClass(client: Client, token: string): Promise<JoinAnswer> {
  const { data, error } = await client.rpc("join_class", { token: clipInviteToken(token) });
  if (error || typeof data !== "string" || !JOIN_ANSWERS.has(data as JoinAnswer)) {
    return "unavailable";
  }
  return data as JoinAnswer;
}

export interface StudentClass {
  id: string;
  name: string;
  joinedAt: string;
  /** The IANA zone the class's due times are read in (#242). */
  timeZone: string;
}

/** The caller's own classes: id, name and zone, never a token (`public.my_classes`). */
export async function myClasses(client: Client): Promise<StudentClass[] | null> {
  const { data, error } = await client.rpc("my_classes");
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.class_id,
    name: row.class_name,
    joinedAt: row.joined_at,
    // Missing only while a deploy runs ahead of its migration.
    timeZone: row.time_zone || DEFAULT_CLASS_TIME_ZONE,
  }));
}
