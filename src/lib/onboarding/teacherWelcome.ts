import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/**
 * The welcome a new teacher sees once, the first time they reach the author home (#364): a title
 * and one line. The Get started checklist (`checklist.ts`) beside it says what to do; the welcome
 * says only what the checklist does not, whose workspace this is.
 */

export interface WelcomeStep {
  title: string;
  /** Short paragraphs, plain text. */
  body: readonly string[];
}

/** The welcome's button: it closes the welcome and hands over to the checklist. */
export const TEACHER_WELCOME_FINISH = "Get started";

/**
 * One step, greeting the teacher by name when they have one. A colleague who came in by
 * invitation did not make this workspace and is not alone in it, so they are told it is shared.
 */
export function teacherWelcomeSteps(
  displayName: string | null,
  options: { invited?: boolean } = {},
): WelcomeStep[] {
  const name = displayName?.trim();
  return [
    {
      title: name ? `Welcome, ${name}` : "Welcome to LeaRN",
      body: [
        options.invited
          ? "You share this workspace's quizzes, classes and results with the other teachers in it."
          : "This is your workspace. No other teacher can see what you make in it.",
      ],
    },
  ];
}

/** What decides whether the welcome shows. */
export interface TeacherWelcomeState {
  /** `orgs.self_registered`: the teacher made this workspace by signing up. */
  selfRegistered: boolean;
  /** `profiles.onboarded_at`: null until the welcome has been finished or skipped. */
  onboardedAt: string | null;
  /** `profiles.display_name`, for the greeting. */
  displayName: string | null;
  /** They came into this workspace by accepting a colleague's invitation (`org_invites`). */
  invited: boolean;
}

/**
 * Only a teacher in a workspace they signed up for, who has not seen it yet. The instructors who
 * were already in the shared org are never interrupted, with no data step needed to mark them.
 */
export function showTeacherWelcome(state: TeacherWelcomeState | null): boolean {
  return state !== null && state.selfRegistered && state.onboardedAt === null;
}

/**
 * Reads what `showTeacherWelcome` needs: the caller's own profile row and their own org row, both
 * under RLS. Null when either read fails or finds nothing, so the page shows no welcome rather
 * than one that might be wrong or might repeat.
 *
 * Whether they were invited is a third read, of the invitation they accepted, which an author may
 * read in their own workspace. If it fails they count as not invited: before the invitations
 * migration is applied the table is not there and nobody has been invited, and that must not take
 * the welcome away from every new teacher.
 */
export async function readTeacherWelcomeState(
  client: Client,
  userId: string,
  orgId: string,
): Promise<TeacherWelcomeState | null> {
  const [profile, org, accepted] = await Promise.all([
    client.from("profiles").select("onboarded_at, display_name").eq("id", userId).maybeSingle(),
    client.from("orgs").select("self_registered").eq("id", orgId).maybeSingle(),
    // The column is named: `token_hash` has no grant, so `select("*")` would be refused.
    client.from("org_invites").select("id").eq("accepted_by", userId).limit(1),
  ]);
  if (profile.error || org.error || !profile.data || !org.data) return null;
  return {
    selfRegistered: org.data.self_registered,
    onboardedAt: profile.data.onboarded_at,
    displayName: profile.data.display_name,
    invited: !accepted.error && (accepted.data?.length ?? 0) > 0,
  };
}
