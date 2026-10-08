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

/** The three steps, greeting the teacher by name when they have one. */
export function teacherWelcomeSteps(displayName: string | null): WelcomeStep[] {
  const name = displayName?.trim();
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
 */
export async function readTeacherWelcomeState(
  client: Client,
  userId: string,
  orgId: string,
): Promise<TeacherWelcomeState | null> {
  const [profile, org] = await Promise.all([
    client.from("profiles").select("onboarded_at, display_name").eq("id", userId).maybeSingle(),
    client.from("orgs").select("self_registered").eq("id", orgId).maybeSingle(),
  ]);
  if (profile.error || org.error || !profile.data || !org.data) return null;
  return {
    selfRegistered: org.data.self_registered,
    onboardedAt: profile.data.onboarded_at,
    displayName: profile.data.display_name,
  };
}
