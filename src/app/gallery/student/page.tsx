import { AssignmentPageHeader } from "@/components/assignments/AssignmentPageHeader";
import { StudentHome, type StudentHomeProps } from "@/components/learn/StudentHome";
import { AppShell } from "@/components/ui/AppShell";
import type { AttemptItemPayload } from "@/lib/assignments/attemptView";
import {
  HOME_FIXTURE_ASSIGNMENTS,
  HOME_FIXTURE_CLASSES,
  HOME_FIXTURE_CLASSES_TWO_WORKSPACES,
  HOME_FIXTURE_HISTORY,
  HOME_FIXTURE_LIVE,
  HOME_FIXTURE_NO_STEPS,
  HOME_FIXTURE_PRACTICE,
  HOME_FIXTURE_PROGRESS,
  HOME_FIXTURE_STEPS,
} from "@/lib/learn/studentHomeFixture";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import type { CjmmStep } from "@/lib/ngn/types";
import { galleryJoinClass, galleryJoinSession } from "./actions";
import { AttemptDemo } from "./demo";

type StudentDemoState = "first-use" | "home" | "workspaces" | "assignment";
const STATES: readonly StudentDemoState[] = ["first-use", "home", "workspaces", "assignment"];

function parseState(value: string | string[] | undefined): StudentDemoState {
  return STATES.find((state) => state === value) ?? "first-use";
}

const HOME: Record<Exclude<StudentDemoState, "assignment">, StudentHomeProps> = {
  "first-use": {
    classes: HOME_FIXTURE_CLASSES,
    assignments: [],
    practice: [],
    history: [],
    steps: HOME_FIXTURE_NO_STEPS,
    live: [],
    joinClass: galleryJoinClass,
    joinSession: galleryJoinSession,
  },
  home: {
    classes: HOME_FIXTURE_CLASSES,
    assignments: HOME_FIXTURE_ASSIGNMENTS,
    progress: HOME_FIXTURE_PROGRESS,
    practice: HOME_FIXTURE_PRACTICE,
    history: HOME_FIXTURE_HISTORY,
    steps: HOME_FIXTURE_STEPS,
    live: HOME_FIXTURE_LIVE,
    joinClass: galleryJoinClass,
    joinSession: galleryJoinSession,
  },
  workspaces: {
    classes: HOME_FIXTURE_CLASSES_TWO_WORKSPACES,
    assignments: HOME_FIXTURE_ASSIGNMENTS,
    progress: HOME_FIXTURE_PROGRESS,
    practice: HOME_FIXTURE_PRACTICE.map((bank) => ({
      ...bank,
      workspaceName: "Riverside College of Nursing",
    })),
    history: HOME_FIXTURE_HISTORY,
    steps: HOME_FIXTURE_STEPS,
    live: HOME_FIXTURE_LIVE,
    joinClass: galleryJoinClass,
    joinSession: galleryJoinSession,
  },
};

const LABELS: Record<StudentDemoState, string> = {
  "first-use": "Student home, first use",
  home: "Student home",
  workspaces: "Student home, two workspaces",
  assignment: "Assignment, part way",
};

/**
 * An assignment part way through, built on the server as `loadAttemptPage` builds one: three loose
 * questions, then the sample case study with steps 1 and 2 answered and step 3 reached, so steps 4
 * to 6 are not sent yet and the count (of 9) is more than the list (6). Every item is keyless.
 */
function attemptFixture() {
  const loose = [
    FIXTURES.multiple_choice.canonical,
    FIXTURES.multiple_response.canonical,
    FIXTURES.multiple_choice.edge,
  ].map((input) => itemSchema.parse(input) as Item);
  const study = caseStudySchema.parse(sampleCaseStudy);
  const steps = study.items.slice(0, 3) as Item[];
  const saved: (AnyResponse | null)[] = [
    { type: "multiple_choice", optionId: "opt_b" },
    { type: "multiple_response", optionIds: ["opt_a"] },
    null,
    { type: "highlight_text", spanIds: ["sp_sob", "sp_sat"] },
    { type: "matrix_multiple_response", rows: [{ rowId: "r_calf", columnIds: ["c_pe"] }] },
    null,
  ];
  const items: AttemptItemPayload[] = [...loose, ...steps].map((item, index) => ({
    itemId: `00000000-0000-4000-8000-0000005631${String(index).padStart(2, "0")}`,
    position: index + 1,
    item: toKeylessItem(item),
    saved: saved[index] ?? null,
  }));
  const records = [
    null,
    null,
    null,
    ...([1, 2, 3] as CjmmStep[]).map((step) => recordAtStep(study.ehr, step)),
  ];
  return { items, total: loose.length + study.items.length, records };
}

/**
 * What a student sees outside the question player (#563), from `studentHomeFixture.ts` and the
 * gallery's item fixtures, with no database behind it. `?state=` picks one: `first-use` (in a
 * class, nothing yet: one empty state), `home` (every list with rows), `workspaces` (classes in
 * two workspaces, so each names its own) and `assignment` (the frame around the player, part way
 * through a quiz with a case study). Each is drawn in the student's `AppShell`, so the join code's
 * place in the first screen can be measured from the shell's top. Every form answers that it is
 * not available here.
 *
 * The assignment's items are keyless, but this route is probed by `scripts/gallery-closed.mjs` all
 * the same, as every gallery route is. Opened by URL, not from the gallery nav.
 */
export default async function StudentGallery({ searchParams }: PageProps<"/gallery/student">) {
  const state = parseState((await searchParams).state);
  const attempt = state === "assignment" ? attemptFixture() : null;
  return (
    <article>
      <p className="eyebrow">Composites</p>
      {/* Not a heading: the page's own title is the h1, as on the real page. */}
      <p className="mt-2 text-2xl font-semibold">{LABELS[state]}</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        A fictional student. Every form answers that it is not available here.
      </p>
      <div data-testid="student-demo" className="-mx-5 border-y border-line sm:mx-0 sm:border-x">
        <AppShell landmarks={false} homeHref="#student-demo" width="wide">
          {attempt ? (
            <>
              <AssignmentPageHeader
                assignment={{
                  title: "Week 9: Respiratory case study",
                  closesAt: "2026-11-21T00:00:00Z",
                  maxAttempts: 2,
                }}
                timeZone="America/Denver"
              />
              <div className="mt-6">
                <AttemptDemo
                  items={attempt.items}
                  total={attempt.total}
                  records={attempt.records}
                />
              </div>
            </>
          ) : (
            <StudentHome {...HOME[state as Exclude<StudentDemoState, "assignment">]} />
          )}
        </AppShell>
      </div>
    </article>
  );
}
