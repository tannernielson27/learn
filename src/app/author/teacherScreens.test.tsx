import { cleanup, render, screen, within } from "@testing-library/react";
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
  library: {
    ready: true,
    folders: [] as { id: string; parentId: string | null; name: string; quizCount: number }[],
  },
  libraryTrail: [] as unknown[],
  bankShares: [] as unknown[] | null,
  classShares: [] as unknown[] | null,
  classes: [] as unknown[] | null,
  roster: [] as unknown[] | null,
  assignments: [] as unknown[] | null,
  members: [] as unknown[] | null,
  invites: [] as unknown[] | null,
  workspace: { name: "Ward 4 teaching", selfRegistered: true } as unknown,
  founderId: null as string | null,
  moveContext: null as unknown,
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
  moveToFolderInBank: action(),
  renameBank: action(),
  renameFolderInBank: action(),
  signOut: action(),
}));
vi.mock("@/app/author/libraryActions", () => ({
  createLibraryFolderAction: action(),
  createQuizInFolderAction: action(),
  deleteLibraryFolderAction: action(),
  moveQuizzesAction: action(),
  renameLibraryFolderAction: action(),
}));
vi.mock("@/app/author/quizMoveActions", () => ({
  moveToQuizAction: action(),
  turnFolderIntoQuizAction: action(),
}));
vi.mock("@/app/author/archiveActions", () => ({
  archiveSelectedAction: action(),
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
// The open library folder's own quizzes are state.banks; the top level lists them too.
vi.mock("@/lib/authoring/libraryData", async (original) => ({
  ...(await original<typeof import("@/lib/authoring/libraryData")>()),
  readLibrary: async () => ({
    ready: state.library.ready,
    folders: state.library.folders,
    quizzes: state.banks,
  }),
  quizLibraryTrail: async () => state.libraryTrail,
}));
vi.mock("@/lib/authoring/quizMoveData", async (original) => ({
  ...(await original<typeof import("@/lib/authoring/quizMoveData")>()),
  readMoveContext: async () => state.moveContext,
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
const classes = await import("./classes/(list)/page");
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
  state.moveContext = {
    quizzes: [{ id: "b2", name: "Renal week" }],
    uses: { assignments: 1, liveSessions: 2 },
  };
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

const LIB_FOLDER = "00000000-0000-4000-8000-0000000000e1";
const LIB_CHILD = "00000000-0000-4000-8000-0000000000e2";

/** The library with two folders at the top and one inside the first (#411). */
function withLibraryFolders() {
  state.library = {
    ready: true,
    folders: [
      { id: LIB_FOLDER, parentId: null, name: "Med-Surg", quizCount: 2 },
      { id: LIB_CHILD, parentId: LIB_FOLDER, name: "Week 1", quizCount: 0 },
      {
        id: "00000000-0000-4000-8000-0000000000e3",
        parentId: null,
        name: "Pediatrics",
        quizCount: 1,
      },
    ],
  };
}

type Query = Record<string, string>;
const homePage = (query: Query = {}) =>
  home.default({ params: Promise.resolve({}), searchParams: Promise.resolve(query) });
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
  { name: "/author", title: home.metadata.title, counted: true, draw: () => homePage() },
  {
    name: "/author, no quizzes",
    title: home.metadata.title,
    counted: true,
    setup: empty,
    draw: () => homePage(),
  },
  {
    name: "/author, with folders",
    title: home.metadata.title,
    counted: true,
    setup: withLibraryFolders,
    draw: () => homePage(),
  },
  {
    name: "/author, in a folder",
    title: home.metadata.title,
    counted: true,
    setup: withLibraryFolders,
    draw: () => homePage({ folder: LIB_FOLDER }),
  },
  {
    name: "/author, in a folder inside a folder",
    title: home.metadata.title,
    setup: withLibraryFolders,
    draw: () => homePage({ folder: LIB_CHILD }),
  },
  {
    name: "/author, an empty folder",
    title: home.metadata.title,
    counted: true,
    setup: () => {
      empty();
      withLibraryFolders();
    },
    draw: () => homePage({ folder: LIB_FOLDER }),
  },
  {
    name: "/author, before folders are ready",
    title: home.metadata.title,
    setup: () => {
      state.library = { ready: false, folders: [] };
    },
    draw: () => homePage(),
  },
  {
    name: "/author/banks/[bankId], no folders inside it",
    title: bank.metadata.title,
    counted: true,
    setup: () => {
      state.folders = [];
      state.libraryTrail = [{ id: LIB_FOLDER, parentId: null, name: "Med-Surg" }];
    },
    draw: () => bankPage(),
  },
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
    counted: true,
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
  state.library = { ready: true, folders: [] };
  state.libraryTrail = [];
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

describe("library folders (#411)", () => {
  it("shows a workspace with no folders as before, with a way to make one", async () => {
    render(await homePage());
    expect(screen.queryByRole("list", { name: "Folders" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Move selected to" })).toBeNull();
    expect(screen.getByRole("list", { name: "Quizzes" })).toBeInTheDocument();
    expect(screen.getByText("New folder")).toBeInTheDocument();
  });

  it("lists folders with the quizzes in no folder, each quiz selectable for a move", async () => {
    withLibraryFolders();
    render(await homePage());
    const folders = within(screen.getByRole("list", { name: "Folders" }));
    expect(folders.getByRole("link", { name: /Med-Surg/ })).toHaveAttribute(
      "href",
      `/author?folder=${LIB_FOLDER}`,
    );
    // Only the top level's folders: Week 1 is inside Med-Surg.
    expect(folders.queryByRole("link", { name: /Week 1/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select Cardiac week" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Move selected to" })).toBeInTheDocument();
  });

  it("opens a folder under a breadcrumb back to the library", async () => {
    withLibraryFolders();
    render(await homePage({ folder: LIB_FOLDER }));
    expect(screen.getByRole("heading", { level: 1, name: "Med-Surg" })).toBeInTheDocument();
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/author");
    expect(screen.getByRole("button", { name: "Delete folder" })).toBeInTheDocument();
  });

  it("offers no deeper folder inside a folder that is two deep", async () => {
    withLibraryFolders();
    render(await homePage({ folder: LIB_CHILD }));
    expect(screen.queryByText("New folder")).toBeNull();
  });

  it("reads an unknown folder as not found", async () => {
    withLibraryFolders();
    await expect(homePage({ folder: "00000000-0000-4000-8000-0000000000ff" })).rejects.toThrow(
      "notFound",
    );
  });

  it("lists every quiz with its folder in All quizzes, each with Start", async () => {
    withLibraryFolders();
    state.banks = [
      { ...(state.banks[0] as object), folderId: LIB_CHILD },
      { ...(state.banks[1] as object), folderId: null },
    ];
    render(await homePage({ folder: "all" }));
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    const rail = within(screen.getByRole("list", { name: "Folders" }));
    expect(rail.getByRole("link", { name: "All quizzes" })).toHaveAttribute("aria-current", "page");
    const quizzes = within(screen.getByRole("list", { name: "Quizzes" }));
    expect(quizzes.getByRole("link", { name: /Cardiac week/ })).toHaveTextContent(
      "Med-Surg/Week 1",
    );
    expect(quizzes.getByRole("link", { name: /Renal week/ })).toHaveTextContent("Not in a folder");
    expect(
      quizzes.getByRole("button", { name: "Start a live session of Cardiac week" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search quizzes" })).toBeInTheDocument();
  });

  it("lists the quizzes and offers no folder controls before folders are ready", async () => {
    state.library = { ready: false, folders: [] };
    render(await homePage());
    expect(screen.getByRole("list", { name: "Quizzes" })).toBeInTheDocument();
    expect(screen.queryByText("New folder")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /^Select / })).toBeNull();
  });
});

describe("a new quiz offers no folders inside it (#411)", () => {
  it("shows no in-quiz folder controls on a quiz with none", async () => {
    state.folders = [];
    state.moveContext = { quizzes: [], uses: { assignments: 0, liveSessions: 0 } };
    render(await bankPage());
    expect(screen.queryByRole("navigation", { name: "Folders" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Folder name" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Move selected to" })).toBeNull();
    // #471: the rows are still selectable, to archive them.
    expect(screen.getAllByRole("checkbox", { name: /^Select / }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Archive selected" })).toBeInTheDocument();
  });

  it("offers Archive on each current row, and not in the Archived view (#471)", async () => {
    render(await bankPage());
    expect(
      screen.getByRole("button", { name: "Archive Heart failure admission" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Untitled question" })).toBeInTheDocument();
  });

  it("offers Restore, not Archive, in the Archived view (#471)", async () => {
    render(await bankPage({ status: "archived" }));
    expect(screen.queryByRole("button", { name: /^Archive / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive selected" })).toBeNull();
  });

  it("lists the whole quiz for a stale Not in a folder link", async () => {
    state.folders = [];
    render(await bankPage({ folder: "unfiled" }));
    expect(screen.getByRole("heading", { level: 1, name: "Cardiac week" })).toBeInTheDocument();
  });

  it("keeps the controls on a quiz that already has folders inside it", async () => {
    render(await bankPage());
    expect(screen.getByRole("navigation", { name: "Folders" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Folder name" })).toBeInTheDocument();
  });

  it("puts a filed quiz's library folders in its breadcrumbs", async () => {
    state.libraryTrail = [{ id: LIB_FOLDER, parentId: null, name: "Med-Surg" }];
    render(await bankPage());
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Med-Surg" })).toHaveAttribute(
      "href",
      `/author?folder=${LIB_FOLDER}`,
    );
  });
});

describe("moving to another quiz, and turning a folder into one (#417)", () => {
  it("offers a move to another quiz on a quiz with no folders inside it", async () => {
    state.folders = [];
    render(await bankPage());
    expect(screen.getByRole("combobox", { name: "Move to another quiz" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Renal week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to quiz" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Move selected to" })).toBeNull();
    expect(screen.getAllByRole("checkbox", { name: /^Select / }).length).toBeGreaterThan(0);
  });

  it("offers both moves on a quiz with folders inside it", async () => {
    render(await bankPage());
    expect(screen.getByRole("combobox", { name: "Move selected to" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Move to another quiz" })).toBeInTheDocument();
  });

  it("lists, for this quiz, what stays with it", async () => {
    render(await bankPage());
    const kept = screen.getAllByRole("list", { name: "What stays with this quiz", hidden: true });
    expect(kept[0]).toHaveTextContent("Its assignment keeps the questions it was given.");
    expect(kept[0]).toHaveTextContent("Its 2 live session reports keep their questions.");
    expect(kept[0]).toHaveTextContent("Practice with NUR 310 stays with this quiz.");
  });

  it("offers to turn the open folder into a quiz, named after it", async () => {
    render(await bankPage({ folder: FOLDER }));
    expect(screen.getByRole("button", { name: "Turn into a quiz" })).toBeInTheDocument();
    // The confirm step is drawn closed, so its words are on the page for the glossary scan.
    expect(screen.getByText('Turn "Week 1" into a quiz?')).toBeInTheDocument();
    expect(
      screen.getByText('Creates the quiz "Week 1" with this folder\'s contents.'),
    ).toBeInTheDocument();
  });

  it("offers neither when what uses this quiz cannot be read", async () => {
    state.moveContext = null;
    render(await bankPage({ folder: FOLDER }));
    expect(screen.queryByRole("combobox", { name: "Move to another quiz" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn into a quiz" })).toBeNull();
    // The folder controls from before #417 are still there.
    expect(screen.getByRole("combobox", { name: "Move selected to" })).toBeInTheDocument();
  });

  it("offers neither when the practice shares cannot be read", async () => {
    state.bankShares = null;
    render(await bankPage({ folder: FOLDER }));
    expect(screen.queryByRole("combobox", { name: "Move to another quiz" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn into a quiz" })).toBeNull();
  });
});
