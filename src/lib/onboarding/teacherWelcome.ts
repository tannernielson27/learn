import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { checklistSteps } from "./checklist";

type Client = SupabaseClient<Database>;

/**
 * The welcome a new teacher sees once, the first time they reach the author home (#364). It sits
 * next to the Get started checklist (`checklist.ts`) on purpose: the welcome says what the three
 * checklist steps are, in the same order, and names the checklist's own titles, so the two cannot
 * drift into saying different things.
 */

export interface WelcomeStep {
  title: string;
  /** Short paragraphs, plain text. */
  body: readonly string[];
}

/** The last step's button: it closes the welcome and hands over to the checklist. */
export const TEACHER_WELCOME_FINISH = "Get started";

const CHECKLIST = checklistSteps({ banks: [], hasClass: false, hasAssignmentOrSession: false });
const titleOf = (id: (typeof CHECKLIST)[number]["id"]): string =>
  CHECKLIST.find((step) => step.id === id)!.title;

/**
 * What a colleague who came in by invitation sees instead: two steps. They did not make this
 * workspace and are not alone in it, so "no other teacher can see them" would be untrue, and the
 * sample bank is the workspace's to import or not, which the Get started list still offers.
 */
function invitedWelcomeSteps(name: string | undefined): WelcomeStep[] {
  return [
    {
      title: name ? `Welcome, ${name}` : "Welcome to LeaRN",
      body: [
        "You have joined a shared workspace. Its question banks, classes and results belong to the workspace: you and the other teachers in it see and work on the same ones.",
        "Students see only what is assigned to their class or run live.",
      ],
    },
    {
      title: "Where to start",
      body: [
        "Open a question bank to see what is already here, or write questions of your own.",
        "Make a class and share its class code or invite link; students join with either. Then assign a bank as take-home work, or run it live and watch the answers come in.",
      ],
    },
  ];
}

/**
 * The three steps, greeting the teacher by name when they have one. A teacher who was invited into
 * a colleague's workspace gets the two of `invitedWelcomeSteps` instead.
 */
export function teacherWelcomeSteps(
  displayName: string | null,
  options: { invited?: boolean } = {},
): WelcomeStep[] {
  const name = displayName?.trim();
  if (options.invited) return invitedWelcomeSteps(name);
  return [
    {
      title: name ? `Welcome, ${name}` : "Welcome to LeaRN",
      body: [
        "This is your workspace. The question banks, classes and results you make here are yours: no other teacher can see them.",
        "Students see only what you assign to their class or run live.",
      ],
    },
    {
      title: "Start with a question bank",
      body: [
        "A bank holds your questions and case studies. Write your own, or import the sample bank: one question of every type and a case study, published and ready to use.",
        `On the Get started list this is “${titleOf("bank")}”.`,
      ],
    },
    {
      title: "Then a class, and your first session",
      body: [
        "Make a class and share its class code or invite link; students join with either. Then assign a bank as take-home work, or run it live and watch the answers come in.",
        `On the Get started list these are “${titleOf("class")}” and “${titleOf("assign")}”.`,
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
