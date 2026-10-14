import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentReportView } from "@/components/assignments/report/AssignmentReportView";
import { CaseStudyPlayer } from "@/components/case-study/CaseStudyPlayer";
import { CaseStudySummary } from "@/components/case-study/CaseStudySummary";
import { withLoadRecovery } from "@/components/question/RendererRecovery";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { ATTEMPT_REFUSALS } from "@/lib/assignments/attemptRefusals";
import { buildAssignmentReport, type AssignmentReportInput } from "@/lib/assignments/report";
import { findRetiredTerms, readText, wordCount } from "@/lib/copy/retiredTerms";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import { buildStepStandings, type StepMark } from "@/lib/ngn/stepStandings";
import { scoreInProcess, scoreSubmission, toKeylessItem } from "@/lib/ngn/submit";
import { PRACTICE_REFUSALS } from "@/lib/practice/refusals";

/**
 * #415: what a signed-in student sees, and the teacher's assignment report, rendered with their
 * real pages and components over faked reads, and searched for the words docs/glossary.md retired.
 * What is searched is the rendered HTML: its text, its `aria-label`, `title`, `placeholder` and
 * `alt` attributes, and each page's title.
 *
 * The same renders give the word count of each screen. Run with `LEARN_WORD_COUNT=1` to print the
 * table that goes on the pull request. A count is every word in the rendered HTML that is shown:
 * text for screen readers only (`.sr-only`), hidden elements and the body of a closed `<details>`
 * are left out. A question's own words (stem, choices, patient record) are counted; they are the
 * same before and after, so a screen's change is its chrome.
 *
 * Wording that belongs to another pass is drawn on these screens too. It is set aside before the
 * search, sentence by sentence, in `OTHER_PASSES`, so that list is also the list of what is left.
 */

const USER = "00000000-0000-4000-8000-0000000415a1";
const CLASS_A = "00000000-0000-4000-8000-0000000415c1";
const CLASS_B = "00000000-0000-4000-8000-0000000415c2";
const ASSIGNMENT = "00000000-0000-4000-8000-0000000415d1";
const QUIZ = "00000000-0000-4000-8000-0000000415b1";
const ATTEMPT = "00000000-0000-4000-8000-0000000415e1";
const RUN = "00000000-0000-4000-8000-0000000415f1";
const row = (index: number) => `00000000-0000-4000-8000-${String(41500 + index).padStart(12, "0")}`;

/**
 * Sentences these screens draw from files another pass owns. `src/components/classes/**` is the
 * classes pass (#412), `src/components/live/report/**` the live session pass (#414), and
 * `src/lib/ngn/**` keeps "item" as the NCLEX term on purpose.
 */
const OTHER_PASSES: readonly string[] = [
  // src/components/classes/StudentClassList.tsx
  "Type your class code below, or open the invite link your instructor shares.",
  // src/components/classes/JoinByCodeForm.tsx
  "Eight letters and numbers, like ABCD-2345. Your instructor has it.",
  // src/components/classes/JoinClassButton.tsx
  "You are already an instructor, so this account stays one and is not added to the class.",
  // src/lib/auth/landing.ts, which #416 changes to "Go to your quizzes".
  "Go to your item banks",
];

/** Retired words inside a question's own content are clinical writing, not the interface. */
const CONTENT_WORD =
  /\b(?:items?|banks?|charts?|records?|rooms?|sessions?|hosts?|members?|instructors?|authors?)\b/gi;

function plain<T>(value: T): T {
  if (typeof value === "string") return value.replace(CONTENT_WORD, "note") as T;
  if (Array.isArray(value)) return value.map((entry) => plain(entry)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        // Ids, kinds and types are code, and are matched by the schemas.
        ["id", "type", "kind", "tags"].includes(key) || key.endsWith("Id") ? entry : plain(entry),
      ]),
    ) as T;
  }
  return value;
}

const MC = itemSchema.parse(plain(FIXTURES.multiple_choice.canonical)) as Item;
const MR = itemSchema.parse(plain(FIXTURES.multiple_response.canonical)) as Item;
const CASE = caseStudySchema.parse(plain(sampleCaseStudy));

const state = vi.hoisted(() => ({
  viewer: { status: "signed_in", role: "student" } as Record<string, unknown>,
  classes: [] as unknown[] | null,
  open: [] as unknown[] | null,
  progress: new Map<string, unknown>(),
  practice: [] as unknown[] | null,
  history: [] as unknown[] | null,
  steps: null as unknown,
  attemptPage: { kind: "missing" } as unknown,
  resultsPage: { kind: "missing" } as unknown,
  practicePage: { kind: "missing" } as unknown,
  invite: { status: "invalid" } as unknown,
  report: null as unknown,
}));

const action = () => vi.fn(async () => ({ error: null }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "learn.test" }),
}));
vi.mock("@/app/sign-in/actions", () => ({
  resendConfirmation: action(),
  verifySignInCode: action(),
}));
vi.mock("@/app/learn/actions", () => ({
  joinClassWithCode: vi.fn(async () => ({ status: "idle" })),
  markStudentOnboarded: action(),
}));
vi.mock("@/app/learn/assignments/[assignmentId]/actions", () => ({
  startAssignmentAttempt: action(),
  submitAssignmentAttempt: action(),
}));
vi.mock("@/app/learn/practice/[bankId]/actions", () => ({ startPracticeOverAction: action() }));
vi.mock("@/app/c/[token]/actions", () => ({
  joinInvitedClass: action(),
  requestInviteLink: action(),
  signUpWithPassword: action(),
}));
vi.mock("@/app/account/actions", () => ({ saveDisplayName: action() }));

const supabase = { auth: { getClaims: async () => ({ data: { claims: { sub: USER } } }) } };
const signedIn = () => ({
  supabase,
  userId: USER,
  email: "sam@school.edu",
  displayName: "Sam Reyes",
  ...state.viewer,
});
vi.mock("@/lib/classes/viewer", () => ({
  requireStudent: async () => signedIn(),
  readViewer: async () => signedIn(),
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: async () => ({ supabase, userId: USER }),
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/auth/signInRateLimit", () => ({ clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/supabase/classInvites", () => ({
  myClasses: async () => state.classes,
  resolveClassInvite: async () => state.invite,
}));
vi.mock("@/lib/supabase/assignments", () => ({ listOpenAssignments: async () => state.open }));
vi.mock("@/lib/supabase/attempts", () => ({
  listMyAttemptProgress: async () => state.progress,
}));
vi.mock("@/lib/supabase/practice", () => ({ readMyPracticeBanks: async () => state.practice }));
vi.mock("@/lib/assignments/attemptStore", () => ({
  historyStore: () => ({}),
  attemptPageStore: () => ({}),
  resultsStore: () => ({}),
  assignmentReportStore: () => ({}),
}));
vi.mock("@/lib/practice/store", () => ({ practicePageStore: () => ({}) }));
vi.mock("@/lib/assignments/history", async (original) => ({
  ...(await original<typeof import("@/lib/assignments/history")>()),
  loadStudentRecord: async () => ({ history: state.history, steps: state.steps }),
}));
vi.mock("@/lib/assignments/attemptPage", async (original) => ({
  ...(await original<typeof import("@/lib/assignments/attemptPage")>()),
  loadAttemptPage: async () => state.attemptPage,
}));
vi.mock("@/lib/assignments/results", async (original) => ({
  ...(await original<typeof import("@/lib/assignments/results")>()),
  loadResultsPage: async () => state.resultsPage,
}));
vi.mock("@/lib/practice/page", async (original) => ({
  ...(await original<typeof import("@/lib/practice/page")>()),
  loadPracticePage: async () => state.practicePage,
}));
// The tables by question and by step are the live session report's (#414), wording included.
vi.mock("@/components/live/report/ReportTables", async (original) => ({
  ...(await original<typeof import("@/components/live/report/ReportTables")>()),
  ItemTable: () => <p>[table by question, from the live session report]</p>,
  StepTable: () => <p>[table by step, from the live session report]</p>,
}));
vi.mock("@/lib/assignments/reportLoader", () => ({
  loadAssignmentReport: async () => state.report,
}));
vi.mock("@/lib/onboarding/studentWelcome", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding/studentWelcome")>()),
  readStudentWelcomeState: async () => null,
}));

// --- what the faked reads answer -----------------------------------------------------------------

const CLASSES = [
  {
    id: CLASS_A,
    name: "NUR 310",
    joinedAt: "2026-09-01T15:00:00Z",
    timeZone: "America/Denver",
    workspaceName: "Ward 4 teaching",
  },
  {
    id: CLASS_B,
    name: "NUR 420",
    joinedAt: "2026-09-02T15:00:00Z",
    timeZone: "America/Denver",
    workspaceName: "Ward 4 teaching",
  },
];
const HEADER = {
  id: ASSIGNMENT,
  classId: CLASS_A,
  title: "Week 5: Heart failure",
  closesAt: "2026-10-20T23:00:00Z",
  maxAttempts: 2,
};
const SUBMITTED_ATTEMPT = {
  id: ATTEMPT,
  number: 1,
  startedAt: "2026-10-12T15:00:00Z",
  submittedAt: "2026-10-12T15:30:00Z",
  autoSubmitted: false,
};
const stepMarks = (cjmmStep: number | null, count: number, right: number): StepMark[] =>
  Array.from({ length: count }, (_, i) => ({
    source: i % 2 === 0 ? "assignments" : "practice",
    cjmmStep,
    points: i < right ? 1 : 0,
    maxPoints: 1,
  }));

function fullHome() {
  state.classes = CLASSES;
  state.open = [
    { ...HEADER, opensAt: "2026-10-10T15:00:00Z", shuffleOptions: false },
    {
      ...HEADER,
      id: row(1),
      classId: CLASS_B,
      title: "Sepsis case study",
      opensAt: "2026-10-10T15:00:00Z",
      shuffleOptions: false,
    },
  ];
  state.progress = new Map([[ASSIGNMENT, { submitted: 1, open: false }]]);
  state.practice = [
    { bankId: QUIZ, name: "Cardiac week", itemCount: 12, answered: 4, workspaceName: null },
    { bankId: row(2), name: "Fluids", itemCount: 1, answered: 0, workspaceName: null },
  ];
  state.history = [
    {
      id: row(3),
      classId: CLASS_A,
      title: "Week 4: Respiratory",
      closesAt: "2026-10-05T23:00:00Z",
      maxAttempts: 2,
      attemptsUsed: 2,
      standing: { kind: "scored", best: { score: 7, maxScore: 10, percent: 70 } },
    },
    {
      id: row(4),
      classId: CLASS_A,
      title: "Week 3: Renal",
      closesAt: "2026-09-28T23:00:00Z",
      maxAttempts: 1,
      attemptsUsed: 0,
      standing: { kind: "not_attempted" },
    },
  ];
  state.steps = buildStepStandings([
    ...stepMarks(1, 12, 3),
    ...stepMarks(4, 5, 4),
    ...stepMarks(2, 2, 0),
    ...stepMarks(null, 3, 1),
  ]);
}

function emptyHome() {
  state.classes = [];
  state.open = [];
  state.progress = new Map();
  state.practice = [];
  state.history = [];
  state.steps = buildStepStandings([]);
}

const taking = (items: Item[], record: unknown = null) => ({
  kind: "taking",
  assignment: HEADER,
  attempt: { id: ATTEMPT, number: 1 },
  items: items.map((item, index) => ({
    itemId: row(10 + index),
    position: index + 1,
    item: toKeylessItem(item),
    saved: null,
  })),
  record,
});

const mrMissingOne = () => {
  if (MR.type !== "multiple_response") throw new Error("not MR");
  return {
    type: "multiple_response" as const,
    optionIds: MR.answerKey.correctOptionIds.slice(1),
  };
};

const results = () => {
  const response = mrMissingOne();
  return {
    kind: "results",
    assignment: HEADER,
    best: { attemptNumber: 2, score: 7, maxScore: 10 },
    attemptsMade: 2,
    entries: [
      {
        rowId: row(20),
        item: MR,
        outcome: { kind: "answered", response, score: scoreSubmission(MR, response).score },
      },
      { rowId: row(21), item: MC, outcome: { kind: "not_answered" } },
    ],
    record: null,
  };
};

const practiceView = (caseStudy = false) => ({
  kind: "ready",
  view: {
    runId: RUN,
    bankName: "Cardiac week",
    total: caseStudy ? 7 : 2,
    answered: 0,
    entries: caseStudy
      ? [
          {
            kind: "case_study",
            id: row(30),
            title: CASE.title,
            ehr: CASE.ehr,
            steps: CASE.items.map((item, index) => ({
              kind: "item",
              itemId: row(31 + index),
              item: toKeylessItem(item as Item),
              answered: null,
            })),
          },
          { kind: "item", itemId: row(40), item: toKeylessItem(MC), answered: null },
        ]
      : [
          { kind: "item", itemId: row(40), item: toKeylessItem(MC), answered: null },
          { kind: "item", itemId: row(41), item: toKeylessItem(MR), answered: null },
        ],
  },
});

const REPORT_INPUT: AssignmentReportInput = {
  released: true,
  items: [
    { position: 1, itemId: row(50), ref: "mc-hf", type: "multiple_choice", cjmmStep: 1 },
    { position: 2, itemId: row(51), ref: "mr-hf", type: "multiple_response", cjmmStep: null },
  ],
  students: [
    { id: "s-ava", displayName: "Ava" },
    { id: "s-ben", displayName: "Ben" },
  ],
  attempts: [
    {
      studentId: "s-ava",
      id: "ava-1",
      number: 1,
      submittedAt: "2026-09-23T10:00:00Z",
      score: 1.5,
      maxScore: 2,
      marks: [
        { itemId: row(50), points: 1, maxPoints: 1 },
        { itemId: row(51), points: 0.5, maxPoints: 1 },
      ],
    },
    {
      studentId: "s-gone",
      id: "gone-1",
      number: 1,
      submittedAt: "2026-09-23T10:00:00Z",
      score: 1,
      maxScore: 2,
      marks: [
        { itemId: row(50), points: 1, maxPoints: 1 },
        { itemId: row(51), points: 0, maxPoints: 1 },
      ],
    },
  ],
  removed: [{ id: "s-gone", displayName: "Gil" }],
} as AssignmentReportInput;

const reportView = (view: "students" | "items" | "steps", released = true, untagged = false) => (
  <AssignmentReportView
    assignmentId={ASSIGNMENT}
    classId={CLASS_A}
    title="Week 5: Heart failure"
    closesAt="2026-09-23T17:00:00Z"
    maxAttempts={2}
    report={buildAssignmentReport({
      ...REPORT_INPUT,
      released,
      items: untagged
        ? REPORT_INPUT.items.map((item) => ({ ...item, cjmmStep: null }))
        : REPORT_INPUT.items,
    })}
    view={view}
  />
);

// --- the screens ---------------------------------------------------------------------------------

const assignmentParams = { params: Promise.resolve({ assignmentId: ASSIGNMENT }) } as never;

async function home(): Promise<ReactElement> {
  const { default: Page } = await import("./page");
  return Page();
}
async function assignment(): Promise<ReactElement> {
  const { default: Page } = await import("./assignments/[assignmentId]/page");
  return Page(assignmentParams);
}
async function resultsPage(): Promise<ReactElement> {
  const { default: Page } = await import("./assignments/[assignmentId]/results/page");
  return Page(assignmentParams);
}
async function practice(): Promise<ReactElement> {
  const { default: Page } = await import("./practice/[bankId]/page");
  return Page({ params: Promise.resolve({ bankId: QUIZ }) } as never);
}
async function invite(): Promise<ReactElement> {
  const { default: Page } = await import("@/app/c/[token]/page");
  return Page({ params: Promise.resolve({ token: "a".repeat(32) }) } as never);
}
async function account(): Promise<ReactElement> {
  const { default: Page } = await import("@/app/account/page");
  return Page();
}

const Broken = withLoadRecovery<{ item: { id: string; type: string } }>(
  () => {
    throw new Error("chunk failed");
  },
  async () => () => {
    throw new Error("chunk failed again");
  },
  () => {},
);

interface Screen {
  name: string;
  arrange?: () => void;
  element: () => Promise<ReactElement> | ReactElement;
  /** Moves the screen into the state named, after the first render. */
  then?: () => Promise<void> | void;
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }));
};

const SCREENS: readonly Screen[] = [
  { name: "/learn, no class yet", arrange: emptyHome, element: home },
  { name: "/learn, two classes with everything", arrange: fullHome, element: home },
  {
    name: "/learn, nothing could be loaded",
    arrange: () => {
      state.classes = null;
      state.open = null;
      state.practice = null;
      state.history = null;
      state.steps = null;
    },
    element: home,
  },
  {
    name: "assignment, not started",
    arrange: () => {
      state.attemptPage = {
        kind: "summary",
        assignment: HEADER,
        attempts: [],
        closed: false,
        canStart: true,
      };
    },
    element: assignment,
  },
  {
    name: "assignment, answering a question",
    arrange: () => {
      state.attemptPage = taking([MC, MR]);
    },
    element: assignment,
  },
  {
    name: "assignment, asked to confirm the submit",
    arrange: () => {
      state.attemptPage = taking([MC, MR]);
    },
    element: assignment,
    then: () => click("Submit assignment"),
  },
  {
    name: "assignment, a case study with its patient record",
    arrange: () => {
      state.attemptPage = taking(CASE.items as Item[], CASE.ehr);
    },
    element: assignment,
  },
  {
    name: "assignment, submitted with no attempts left",
    arrange: () => {
      state.attemptPage = {
        kind: "summary",
        assignment: { ...HEADER, maxAttempts: 1 },
        attempts: [SUBMITTED_ATTEMPT],
        closed: false,
        canStart: false,
      };
    },
    element: assignment,
  },
  {
    name: "assignment, closed",
    arrange: () => {
      state.attemptPage = {
        kind: "summary",
        assignment: HEADER,
        attempts: [{ ...SUBMITTED_ATTEMPT, autoSubmitted: true }],
        closed: true,
        canStart: false,
      };
    },
    element: assignment,
  },
  {
    name: "assignment, could not be loaded",
    arrange: () => {
      state.attemptPage = { kind: "failed" };
    },
    element: assignment,
  },
  {
    name: "results, before the close",
    arrange: () => {
      state.resultsPage = { kind: "pending", assignment: HEADER };
    },
    element: resultsPage,
  },
  {
    name: "results, a marked answer",
    arrange: () => {
      state.resultsPage = results();
    },
    element: resultsPage,
  },
  {
    name: "results, a question left blank",
    arrange: () => {
      state.resultsPage = results();
    },
    element: resultsPage,
    then: () => click(/2, not answered/),
  },
  {
    name: "results, one attempt",
    arrange: () => {
      state.resultsPage = {
        ...results(),
        best: { attemptNumber: 1, score: 7, maxScore: 10 },
        attemptsMade: 1,
        entries: [],
      };
    },
    element: resultsPage,
  },
  {
    name: "results, could not be loaded",
    arrange: () => {
      state.resultsPage = { kind: "failed" };
    },
    element: resultsPage,
  },
  {
    name: "practice, answering a question",
    arrange: () => {
      state.practicePage = practiceView();
    },
    element: practice,
  },
  {
    name: "practice, asked to confirm starting over",
    arrange: () => {
      state.practicePage = practiceView();
    },
    element: practice,
    then: () => click("Start over"),
  },
  {
    name: "practice, a case study",
    arrange: () => {
      state.practicePage = practiceView(true);
    },
    element: practice,
  },
  {
    name: "practice, nothing in the quiz",
    arrange: () => {
      state.practicePage = {
        kind: "ready",
        view: { runId: RUN, bankName: "Cardiac week", total: 0, answered: 0, entries: [] },
      };
    },
    element: practice,
  },
  {
    name: "practice, could not be loaded",
    arrange: () => {
      state.practicePage = { kind: "failed" };
    },
    element: practice,
  },
  {
    name: "case study, step 1",
    element: () => <CaseStudyPlayer caseStudy={CASE} submitFor={scoreInProcess} />,
  },
  {
    name: "case study, review list",
    element: () => <CaseStudyPlayer caseStudy={CASE} submitFor={scoreInProcess} />,
    then: () => click("Review"),
  },
  {
    name: "case study, results",
    element: () => (
      <CaseStudySummary results={CASE.items.map(() => scoreSubmission(MC, firstAnswer()).score)} />
    ),
  },
  {
    name: "question, could not load",
    element: () => <Broken item={{ id: "q1", type: "multiple_choice" }} />,
  },
  {
    name: "question, still could not load",
    element: () => <Broken item={{ id: "q2", type: "multiple_choice" }} />,
    then: () => click("Try again"),
  },
  {
    name: "/c/[token], a teacher opens it",
    arrange: () => {
      state.invite = { status: "open", classId: CLASS_A, className: "NUR 310" };
      state.viewer = { status: "signed_in", role: "instructor" };
    },
    element: invite,
  },
  {
    name: "/c/[token], already in the class",
    arrange: () => {
      state.invite = { status: "open", classId: CLASS_A, className: "NUR 310" };
      state.classes = CLASSES;
    },
    element: invite,
  },
  {
    name: "/c/[token], a student about to join",
    arrange: () => {
      state.invite = { status: "open", classId: CLASS_A, className: "NUR 310" };
      state.classes = [];
    },
    element: invite,
  },
  {
    name: "/c/[token], too many tries",
    arrange: () => {
      state.invite = { status: "rate_limited" };
    },
    element: invite,
  },
  { name: "/account, a student", element: account },
  {
    name: "/account, a teacher",
    arrange: () => {
      state.viewer = { status: "signed_in", role: "instructor" };
    },
    element: account,
  },
  { name: "assignment report, students, closed", element: () => reportView("students") },
  { name: "assignment report, students, still open", element: () => reportView("students", false) },
  { name: "assignment report, questions", element: () => reportView("items") },
  { name: "assignment report, steps", element: () => reportView("steps") },
  {
    name: "assignment report, steps, none tagged",
    element: () => reportView("steps", true, true),
  },
];

function firstAnswer() {
  if (MC.type !== "multiple_choice") throw new Error("not MC");
  return { type: "multiple_choice" as const, optionId: MC.answerKey.correctOptionId };
}

/** The rendered HTML with what is not shown taken out: the count is of what is on the screen. */
function shownHtml(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll(".sr-only, [hidden], details:not([open]) > *")) {
    if (hidden.tagName !== "SUMMARY") hidden.remove();
  }
  return copy.innerHTML;
}

const setAside = (text: string): string =>
  OTHER_PASSES.reduce((rest, sentence) => rest.split(sentence).join(" "), text);

const counts: [string, number][] = [];

async function draw(entry: Screen): Promise<HTMLElement> {
  entry.arrange?.();
  const { container } = render(await entry.element());
  await renderersLoaded();
  await entry.then?.();
  await renderersLoaded();
  return container;
}

beforeEach(() => {
  state.viewer = { status: "signed_in", role: "student" };
  fullHome();
  // A caught render error is reported through console.error; the two failure screens mean to.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => {
  if (!process.env.LEARN_WORD_COUNT) return;
  const lines = counts.map(([name, words]) => `| ${name} | ${words} |`);
  process.stdout.write(`\n| Screen | Words |\n| --- | --- |\n${lines.join("\n")}\n`);
});

describe("the search itself", () => {
  it("finds a retired word in text and in an aria-label, so a clean result means something", () => {
    const { container } = render(
      <section aria-label="Practice banks">
        <p>Complete the item to submit.</p>
      </section>,
    );
    const found = findRetiredTerms(readText(container.innerHTML)).join("\n");
    expect(found).toContain('"bank"');
    expect(found).toContain('"item"');
  });

  it("does not set aside a retired word that only sits near another pass's sentence", () => {
    expect(findRetiredTerms(setAside(`${OTHER_PASSES[0]} Ask your instructor.`))).toHaveLength(1);
  });
});

describe("what a student sees uses the glossary's words (#415)", () => {
  it.each(SCREENS)("$name", async (entry) => {
    const container = await draw(entry);
    counts.push([entry.name, wordCount(readText(shownHtml(container)).split(" \n ")[0] ?? "")]);
    // Body, not container: the patient record's phone sheet is drawn outside the container.
    expect(findRetiredTerms(setAside(readText(document.body.innerHTML)))).toEqual([]);
  });

  it("names each page in the glossary's words", async () => {
    const pages = await Promise.all([
      import("./page"),
      import("./assignments/[assignmentId]/page"),
      import("./assignments/[assignmentId]/results/page"),
      import("./practice/[bankId]/page"),
      import("@/app/c/[token]/page"),
      import("@/app/account/page"),
      import("@/app/author/assignments/[assignmentId]/report/page"),
    ]);
    const titles = pages.map((page) => String(page.metadata.title));
    expect(titles).toHaveLength(7);
    expect(titles.flatMap((title) => findRetiredTerms(title))).toEqual([]);
  });

  it("refuses in the glossary's words", () => {
    const refusals = [...Object.values(ATTEMPT_REFUSALS), ...Object.values(PRACTICE_REFUSALS)];
    expect(refusals.flatMap((refusal) => findRetiredTerms(refusal))).toEqual([]);
  });
});
