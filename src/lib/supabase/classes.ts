import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * The author's side of classes (#205), as the signed-in author: row level security keeps every
 * read and write to the author's own org, and the token is only ever read by `readClass`.
 */

/** A cap so the list is never unbounded; an org has a handful of classes a term. */
export const CLASS_LIST_LIMIT = 200;

export interface ClassSummary {
  id: string;
  name: string;
  memberCount: number;
}

export interface ClassDetail {
  id: string;
  name: string;
  inviteToken: string;
}

export interface RosterEntry {
  profileId: string;
  email: string;
  displayName: string | null;
  joinedAt: string;
  /** False until the person has opened a sign-in link at least once. */
  signedIn: boolean;
}

export async function listClasses(client: Client): Promise<ClassSummary[] | null> {
  const { data, error } = await client
    .from("classes")
    .select("id, name, class_members(count)")
    .order("name")
    .limit(CLASS_LIST_LIMIT);
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    memberCount: row.class_members[0]?.count ?? 0,
  }));
}

/** One class and its invite token, or null when the author cannot see it. Throws on an error. */
export async function readClass(client: Client, classId: string): Promise<ClassDetail | null> {
  const { data, error } = await client
    .from("classes")
    .select("id, name, invite_token")
    .eq("id", classId)
    .maybeSingle();
  if (error) throw new Error("The class could not be read.");
  if (!data) return null;
  return { id: data.id, name: data.name, inviteToken: data.invite_token };
}

export async function classRoster(client: Client, classId: string): Promise<RosterEntry[] | null> {
  const { data, error } = await client.rpc("class_roster", { target_class: classId });
  if (error || !data) return null;
  return data.map((row) => ({
    profileId: row.profile_id,
    email: row.email,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    signedIn: row.signed_in,
  }));
}

/** The org and creator come from column defaults; the token from the database's CSPRNG. */
export async function createClass(
  client: Client,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false }> {
  const { data, error } = await client.from("classes").insert({ name }).select("id").single();
  if (error || !data) return { ok: false };
  return { ok: true, id: data.id };
}

export async function renameClass(client: Client, classId: string, name: string): Promise<boolean> {
  const { data, error } = await client
    .from("classes")
    .update({ name })
    .eq("id", classId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** A new token; the old link stops working as this returns. */
export async function rotateInvite(client: Client, classId: string): Promise<boolean> {
  const { error } = await client.rpc("rotate_class_invite", { target_class: classId });
  return !error;
}

/** Takes one student off one class. Their account, and later their past attempts, are kept. */
export async function removeStudent(
  client: Client,
  classId: string,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("profile_id", profileId)
    .select("profile_id");
  return !error && (data?.length ?? 0) > 0;
}
