import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BankRef, OrgProgress } from "./checklist";

type Client = SupabaseClient<Database>;

/**
 * Whether the org has a class, and an assignment or a live session, for the Get started checklist
 * (#265). One id from each table, under RLS and filtered to the author's org; the banks come from
 * the list the author home already read. Null when any read fails, so the page shows no checklist
 * rather than a wrong one.
 */
export async function readOrgProgress(
  client: Client,
  orgId: string,
  banks: readonly BankRef[],
): Promise<OrgProgress | null> {
  const [classes, assignments, sessions] = await Promise.all([
    client.from("classes").select("id").eq("org_id", orgId).limit(1),
    client.from("assignments").select("id").eq("org_id", orgId).limit(1),
    client.from("sessions").select("id").eq("org_id", orgId).limit(1),
  ]);
  if (classes.error || assignments.error || sessions.error) return null;
  const any = (rows: readonly unknown[] | null) => (rows?.length ?? 0) > 0;
  return {
    banks,
    hasClass: any(classes.data),
    hasAssignmentOrSession: any(assignments.data) || any(sessions.data),
  };
}
