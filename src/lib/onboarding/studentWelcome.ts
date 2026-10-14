import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WelcomeStep } from "./teacherWelcome";

type Client = SupabaseClient<Database>;

/**
 * The welcome a new student sees once, the first time they reach the student home in a class
 * (#365). It is drawn from the student's name, their class names and the copy here, and nothing
 * else: no assignment, score, key or rationale is read for it.
 */

/**
 * Accounts made before this are never shown the welcome: students who joined before Sprint 13
 * already know their way around, and nothing marked them as onboarded.
 */
export const STUDENT_WELCOME_SINCE = "2026-10-08T00:00:00Z";

/** The last step's button. */
export const STUDENT_WELCOME_FINISH = "Go to my classes";

function inClasses(classNames: readonly string[]): string {
  const [first, second, ...rest] = classNames;
  if (!first) return "You are signed in.";
  if (!second) return `You are in ${first}.`;
  if (rest.length === 0) return `You are in ${first} and ${second}.`;
  return `You are in ${first}, ${second} and ${rest.length} more.`;
}

/** The three steps, greeting the student by name when they have one. */
export function studentWelcomeSteps(
  displayName: string | null,
  classNames: readonly string[],
): WelcomeStep[] {
  const name = displayName?.trim();
  return [
    {
      title: name ? `Welcome, ${name}` : "Welcome to LeaRN",
      body: [
        inClasses(classNames),
        "Your classes are at the top of this page. Everything your teacher gives you is below them.",
      ],
    },
    {
      title: "Assignments and practice",
      body: [
        "Open assignments lists what is due and when it closes, in your class’s time zone.",
        "Practice lists the quizzes your teacher has shared. Practice is not graded.",
      ],
    },
    {
      title: "Results and live sessions",
      body: [
        "When an assignment closes, it moves to History with your score, the answers and the rationales.",
        "A live session needs no sign-in: go to the join page and type the join code your teacher shows.",
      ],
    },
  ];
}

/** What decides whether the welcome shows. */
export interface StudentWelcomeState {
  /** `profiles.onboarded_at`: null until the welcome has been finished or skipped. */
  onboardedAt: string | null;
  /** `profiles.created_at`: when the account was made. */
  createdAt: string;
  /** `profiles.display_name`, for the greeting. */
  displayName: string | null;
}

/**
 * Only a student in at least one class, whose account was made since `STUDENT_WELCOME_SINCE`, who
 * has not seen it yet. A date that cannot be read is treated as old: no welcome.
 */
export function showStudentWelcome(state: StudentWelcomeState | null, classCount: number): boolean {
  if (state === null || classCount < 1 || state.onboardedAt !== null) return false;
  const created = Date.parse(state.createdAt);
  return Number.isFinite(created) && created >= Date.parse(STUDENT_WELCOME_SINCE);
}

/**
 * Reads what `showStudentWelcome` needs from the caller's own profile row, under RLS. Null when
 * the read fails or finds nothing, so the page shows no welcome rather than one that might repeat.
 */
export async function readStudentWelcomeState(
  client: Client,
  userId: string,
): Promise<StudentWelcomeState | null> {
  const { data, error } = await client
    .from("profiles")
    .select("onboarded_at, created_at, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    onboardedAt: data.onboarded_at,
    createdAt: data.created_at,
    displayName: data.display_name,
  };
}
