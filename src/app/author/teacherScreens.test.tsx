import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRetiredTerms, visibleWordCount } from "@/lib/copy/retiredTerms";

/**
 * #412: the teacher's screens, rendered with their real components over faked reads, and searched
 * for the words docs/glossary.md retired. What is searched is the rendered HTML: its text, its
 * `aria-label`, `title`, `placeholder` and `alt` attributes, and the page's title.
 *
 * The same renders give the visible word count of each screen. Run with `LEARN_WORD_COUNT=1` to
 * print the table that goes on the pull request.
 *
 * The Get started checklist and the welcome are drawn on the home page, but their words live in
 * `src/lib/onboarding`, which #416 renames. They are left out here and checked there.
 */

const BANK = "00000000-0000-4000-8000-0000000000b1";
const FOLDER = "00000000-0000-4000-8000-0000000000f1";
const CHILD_FOLDER = "00000000-0000-4000-8000-0000000000f2";
const CLASS = "00000000-0000-4000-8000-0000000000c1";
const USER = "00000000-0000-4000-8000-0000000000a1";
const COLLEAGUE = "00000000-0000-4000-8000-0000000000a2";
const ORG = "00000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  pathname: "/author",
  role: "instructor" as "instructor" | "student" | null,
  banks: [] as unknown[],
  items: [] as unknown[],
  itemTotal: 0,
  pageCount: 1,
  caseStudies: [] as unknown[],
  taggedRows: [] as unknown[],
  folders: [] as unknown[],
  bankShares: [] as unknown[] | null,
  classShares: [] as unknown[] | null,
  classes: [] as unknown[] | null,
  roster: [] as unknown[] | null,
  assignments: [] as unknown[] | null,
  members: [] as unknown[] | null,
  invites: [] as unknown[] | null,
  workspace: { name: "Ward 4 teaching", selfRegistered: true } as unknown,
  founderId: null as string | null,
}));

const action = () => vi.fn(async () => ({ status: "idle" }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "learn.test" }),
}));
vi.mock("@/lib/http/siteOrigin", () => ({ canonicalSiteOrigin: () => "https://learn.test" }));

vi.mock("@/app/author/actions", () => ({
  createBank: action(),
  createCaseStudyInBank: action(),
  createFolderInBank: action(),
  deleteFolderInBank: action(),
  importIntoBank: action(),
  moveToFolderInBank: action(),
  renameBank: action(),
  renameFolderInBank: action(),
  signOut: action(),
}));
vi.mock("@/app/author/archiveActions", () => ({
  restoreCaseStudyAction: action(),
  restoreItemAction: action(),
}));
vi.mock("@/app/author/onboardingActions", () => ({
  hideGetStarted: action(),
  importSample: action(),
  markOnboarded: action(),
}));
vi.mock("@/app/author/practice/actions", () => ({
  shareBankWithClass: action(),
  shareClassWithBank: action(),
  stopSharing: action(),
}));
vi.mock("@/app/author/classes/actions", () => ({
  createClass: action(),
  removeStudent: action(),
  renameClass: action(),
  rotateInvite: action(),
  setTimeZone: action(),
}));
vi.mock("@/app/author/assignments/actions", () => ({
  deleteAssignment: action(),
  editAssignment: action(),
}));
vi.mock("@/app/author/workspace/actions", () => ({
  inviteColleague: action(),
  removeMember: action(),
  resendInvite: action(),
  revokeInvite: action(),
}));
vi.mock("@/app/live/actions", () => ({ startLiveSession: action() }));
vi.mock("@/app/sign-in/actions", () => ({ resendConfirmation: action() }));

const supabase = {
  auth: { getClaims: async () => ({ data: { claims: { sub: USER } } }) },
  from: () => {
    const builder: Record<string, unknown> = {};
    for (const step of ["select", "eq"]) builder[step] = () => builder;
    builder.maybeSingle = async () => ({ data: { id: BANK, name: "Cardiac week" }, error: null });
    return builder;
  },
};
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: async () => ({ supabase, orgId: ORG, userId: USER, email: "ada@school.edu" }),
}));
vi.mock("@/lib/classes/viewer", () => ({
  readViewer: async () =>
    state.role === null
      ? { status: "signed_out" }
      : {
          status: "signed_in",
          supabase,
          userId: USER,
          email: "ada@school.edu",
          role: state.role,
          displayName: "Ada Lovelace",
        },
}));
vi.mock("@/lib/authoring/banks", async (original) => ({
  ...(await original<typeof import("@/lib/authoring/banks")>()),
  listBanks: async () => state.banks,
  listItems: async () => ({
    items: state.items,
    total: state.itemTotal,
    page: 1,
    pageCount: state.pageCount,
  }),
  listCaseStudies: async () => state.caseStudies,
  listTaggedRows: async () => state.taggedRows,
}));
vi.mock("@/lib/authoring/folderData", async (original) => ({
  ...(await original<typeof import("@/lib/authoring/folderData")>()),
  listFolders: async () => state.folders,
}));
vi.mock("@/lib/supabase/classes", () => ({
  listClasses: async () => state.classes,
  readClass: async () => ({
    id: CLASS,
    name: "NUR 310",
    inviteToken: "tokentokentokentoken",
    joinCode: "ABCD2345",
    timeZone: "America/Denver",
  }),
  classRoster: async () => state.roster,
}));
vi.mock("@/lib/supabase/practiceShares", () => ({
  listBankShares: async () => state.bankShares,
  listClassShares: async () => state.classShares,
  listSharedClassNamesByBank: async () => new Map([[BANK, ["NUR 310"]]]),
}));
vi.mock("@/lib/supabase/assignments", () => ({
  listClassAssignments: async () => state.assignments,
}));
vi.mock("@/lib/supabase/workspace", () => ({
  listMembers: async () => state.members,
  listOpenInvites: async () => state.invites,
  readFounderId: async () => state.founderId,
  readWorkspace: async () => state.workspace,
}));
vi.mock("@/lib/onboarding/progress", () => ({ readOrgProgress: async () => null }));
vi.mock("@/lib/onboarding/teacherWelcome", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding/teacherWelcome")>()),
  readTeacherWelcomeState: async () => null,
}));
// #416 owns the checklist's words (src/lib/onboarding); see the note at the top.
vi.mock("@/lib/onboarding/checklist", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding/checklist")>()),
  showChecklist: () => false,
}));

const home = await import("./page");
const layout = await import("./layout");
const bank = await import("./banks/[bankId]/page");
const workspace = await import("./workspace/page");
const classes = await import("./classes/page");
const classPage = await import("./classes/[classId]/page");

const item = (id: string, stemExcerpt: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "multiple_choice",
  status: "published",
  stemExcerpt,
  maxPoints: 1,
  updatedAt: "2026-10-01T10:00:00Z",
  cjmmStep: 2,
  tags: ["Cardiac"],
  match: null,
  warningCount: 0,
  ...over,
});

function fill() {
  state.banks = [
    { id: BANK, name: "Cardiac week", itemCount: 12, updatedAt: "2026-10-01T10:00:00Z" },
    { id: "b2", name: "Renal week", itemCount: 1, updatedAt: "2026-10-02T10:00:00Z" },
  ];
  state.items = [
    item("i1", "A client reports chest pain. Which finding needs follow-up first?"),
    item("i2", "", { status: "draft", maxPoints: null, warningCount: 2, tags: [] }),
  ];
  state.itemTotal = 2;
  state.caseStudies = [
    {
      id: "s1",
      title: "Heart failure admission",
      status: "draft",
      stepCount: 4,
      updatedAt: "2026-10-01T10:00:00Z",
    },
  ];
  state.taggedRows = [{ cjmmStep: 2, tags: ["Cardiac"], warningCount: 1 }];
  state.folders = [
    { id: FOLDER, parentId: null, name: "Week 1" },
    { id: CHILD_FOLDER, parentId: FOLDER, name: "Monday" },
  ];
  state.bankShares = [{ id: CLASS, name: "NUR 310", sharedAt: "2026-10-01T10:00:00Z" }];
  state.classShares = [{ id: BANK, name: "Cardiac week", sharedAt: "2026-10-01T10:00:00Z" }];
  state.classes = [
    { id: CLASS, name: "NUR 310", memberCount: 24 },
    { id: "c2", name: "NUR 420", memberCount: 1 },
  ];
  state.roster = [
    {
      profileId: "p1",
      email: "sam@school.edu",
      displayName: "Sam Rivera",
      joinedAt: "2026-10-01T10:00:00Z",
      signedIn: true,
    },
  ];
  state.assignments = [
    {
      id: "as1",
      classId: CLASS,
      title: "Cardiac week",
      opensAt: "2099-10-01T10:00:00Z",
      closesAt: "2099-10-08T10:00:00Z",
      maxAttempts: 1,
      shuffleOptions: false,
    },
  ];
  state.members = [
    {
      profileId: USER,
      displayName: "Ada Lovelace",
      email: "ada@school.edu",
      role: "instructor",
      joinedAt: "2026-10-01T10:00:00Z",
    },
    {
      profileId: COLLEAGUE,
      displayName: "Mary Seacole",
      email: "mary@school.edu",
      role: "instructor",
      joinedAt: "2026-10-02T10:00:00Z",
    },
  ];
  state.invites = [
    {
      id: "in1",
      email: "kim@school.edu",
      createdAt: "2026-10-08T10:00:00Z",
      expiresAt: "2099-10-15T10:00:00Z",
    },
  ];
  state.workspace = { name: "Ward 4 teaching", selfRegistered: true };
  state.founderId = USER;
}

function empty() {
  state.banks = [];
  state.items = [];
  state.itemTotal = 0;
  state.caseStudies = [];
  state.taggedRows = [];
  state.folders = [];
  state.bankShares = [];
  state.classShares = [];
  state.classes = [];
  state.roster = [];
  state.assignments = [];
  state.invites = [];
}

type Query = Record<string, string>;
const bankPage = (query: Query = {}) =>
  bank.default({
    params: Promise.resolve({ bankId: BANK }),
    searchParams: Promise.resolve(query),
  });

interface Screen {
  name: string;
  title: unknown;
  draw: () => Promise<ReactElement>;
  /** Counted for the pull request's table: the screen as a teacher with content sees it. */
  counted?: boolean;
  setup?: () => void;
}

const SCREENS: Screen[] = [
  {
    name: "header and navigation",
    title: "LeaRN",
    counted: true,
    draw: () => layout.default({ children: null, params: Promise.resolve({}) }),
  },
  { name: "/author", title: home.metadata.title, counted: true, draw: () => home.default() },
  { name: "/author, no quizzes", title: home.metadata.title, setup: empty, draw: home.default },
  {
    name: "/author/banks/[bankId]",
    title: bank.metadata.title,
    counted: true,
    draw: () => bankPage(),
  },
  {
    name: "/author/banks/[bankId], in a folder",
    title: bank.metadata.title,
    counted: true,
    draw: () => bankPage({ folder: FOLDER }),
  },
  {
    name: "/author/banks/[bankId], not in a folder",
    title: bank.metadata.title,
    draw: () => bankPage({ folder: "unfiled" }),
  },
  {
    name: "/author/banks/[bankId], archived",
    title: bank.metadata.title,
    draw: () => bankPage({ status: "archived" }),
  },
  {
    name: "/author/banks/[bankId], empty",
    title: bank.metadata.title,
    counted: true,
    setup: empty,
    draw: () => bankPage(),
  },
  {
    name: "/author/banks/[bankId], empty folder",
    title: bank.metadata.title,
    setup: () => {
      empty();
      state.folders = [{ id: FOLDER, parentId: null, name: "Week 1" }];
    },
    draw: () => bankPage({ folder: FOLDER }),
  },
  {
    name: "/author/banks/[bankId], nothing not in a folder",
    title: bank.metadata.title,
    setup: empty,
    draw: () => bankPage({ folder: "unfiled" }),
  },
  {
    name: "/author/banks/[bankId], nothing archived",
    title: bank.metadata.title,
    setup: empty,
    draw: () => bankPage({ status: "archived" }),
  },
  {
    name: "/author/banks/[bankId], search with no match",
    title: bank.metadata.title,
    setup: empty,
    draw: () => bankPage({ q: "digoxin" }),
  },
  {
    name: "/author/banks/[bankId], tag filter with no match",
    title: bank.metadata.title,
    setup: empty,
    draw: () => bankPage({ tag: "Cardiac", warnings: "1" }),
  },
  {
    name: "/author/banks/[bankId], type filter",
    title: bank.metadata.title,
    draw: () => bankPage({ type: "bowtie" }),
  },
  {
    name: "/author/banks/[bankId], page past the end",
    title: bank.metadata.title,
    setup: empty,
    draw: () => bankPage({ page: "9" }),
  },
  ...["empty", "gone", "failed"].map((live) => ({
    name: `/author/banks/[bankId], live session refused (${live})`,
    title: bank.metadata.title,
    draw: () => bankPage({ live }),
  })),
  {
    name: "/author/workspace",
    title: workspace.metadata.title,
    counted: true,
    draw: () => workspace.default(),
  },
  {
    name: "/author/workspace, the shared workspace",
    title: workspace.metadata.title,
    setup: () => {
      state.workspace = { name: "LeaRN", selfRegistered: false };
    },
    draw: () => workspace.default(),
  },
  {
    name: "/author/workspace, nothing loads",
    title: workspace.metadata.title,
    setup: () => {
      state.workspace = null;
      state.members = null;
      state.invites = null;
    },
    draw: () => workspace.default(),
  },
  {
    name: "/author/classes",
    title: classes.metadata.title,
    counted: true,
    draw: () => classes.default(),
  },
  {
    name: "/author/classes, no classes",
    title: classes.metadata.title,
    setup: empty,
    draw: () => classes.default(),
  },
  {
    name: "/author/classes/[classId]",
    title: classPage.metadata.title,
    counted: true,
    draw: () =>
      classPage.default({
        params: Promise.resolve({ classId: CLASS }),
        searchParams: Promise.resolve({}),
      }),
  },
  {
    name: "/author/classes/[classId], new class",
    title: classPage.metadata.title,
    counted: true,
    setup: empty,
    draw: () =>
      classPage.default({
        params: Promise.resolve({ classId: CLASS }),
        searchParams: Promise.resolve({}),
      }),
  },
];

const counts: [screen: string, words: number][] = [];

beforeEach(() => {
  state.role = "instructor";
  state.pathname = "/author";
  fill();
});
afterEach(cleanup);
afterAll(() => {
  if (!process.env.LEARN_WORD_COUNT) return;
  const rows = counts.map(([screen, words]) => `| ${screen} | ${words} |`).join("\n");
  console.info(`\n| Screen | Visible words |\n| --- | --- |\n${rows}\n`);
});

describe("the teacher's screens use the glossary's words (#412)", () => {
  it.each(SCREENS)("$name", async ({ name, title, draw, setup, counted }) => {
    setup?.();
    const { container } = render(await draw());
    const html = container.innerHTML;
    if (counted) counts.push([name, visibleWordCount(html)]);
    expect(html.length).toBeGreaterThan(200);
    expect(findRetiredTerms(html, String(title))).toEqual([]);
  });
});
