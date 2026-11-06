import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #521: every authoring Server Function that creates, changes or runs something refuses a
 * read-only workspace on the server, before it touches the database, by sending the teacher to the
 * read-only page; and with enforcement off it goes on to the database exactly as before.
 *
 * `guard.test.ts` pins that each one calls `requireWriter`; this calls each one. The session is
 * faked at `requireAuthor`, whose `readOnly` is what `authorForRoute` read; the database client
 * records whether it was reached and answers nothing useful, so a call that gets past the gate
 * ends however it ends, and only whether it got there is asserted.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const touched = vi.fn();
/** Any query builder step, any rpc, any storage call: recorded, then an empty answer. */
function fakeBuilder(): unknown {
  const answer = { data: null, error: { code: "XXTEST", message: "fake" }, count: null };
  const target = () => {};
  const proxy: unknown = new Proxy(target, {
    get(_t, key) {
      if (key === "then") {
        return (resolve: (value: unknown) => unknown) => resolve(answer);
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}
const client = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === "then") return undefined;
      if (key === "auth") {
        return {
          getUser: async () => {
            touched("auth");
            return { data: { user: { id: ID, email: "teacher@example.test" } }, error: null };
          },
        };
      }
      return (...args: unknown[]) => {
        touched(key, args[0]);
        return fakeBuilder();
      };
    },
  },
);

const state = vi.hoisted(() => ({
  readOnly: null as null | { readOnly: true; canManage: boolean },
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: async () => ({
    supabase: client,
    userId: "00000000-0000-4000-8000-0000000000aa",
    email: "teacher@example.test",
    orgId: "00000000-0000-4000-8000-0000000000f1",
    readOnly: state.readOnly,
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => client }));

vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(key, one);
  }
  return data;
}

const filled = form({
  name: "Cardiac",
  title: "Unit 3",
  email: "colleague@example.test",
  timeZone: "America/Denver",
  folderId: ID2,
  itemIds: [ID],
  caseStudyIds: [],
  quizId: ID2,
  classId: ID2,
  bankId: ID2,
  opensAt: "2030-01-01T09:00",
  closesAt: "2030-01-02T09:00",
  maxAttempts: "1",
  mode: "instructor_paced",
  folder: ID2,
  quiz: ID2,
  item: [ID],
  entry: [ID, ID2],
  target: ID2,
});

type Call = [name: string, run: () => Promise<unknown>];

const author = await import("./actions");
const quizOrder = await import("./quizOrderActions");
const items = await import("./items/[itemId]/actions");
const aiImport = await import("./aiImportActions");
const aiFix = await import("./aiImportFixActions");
const classes = await import("./classes/actions");
const onboarding = await import("./onboardingActions");
const library = await import("./libraryActions");
const archive = await import("./archiveActions");
const duplicate = await import("./duplicateActions");
const practice = await import("./practice/actions");
const caseStudies = await import("./case-studies/[caseStudyId]/actions");
const quizMove = await import("./quizMoveActions");
const assignments = await import("./assignments/actions");
const workspace = await import("./workspace/actions");
const live = await import("@/app/live/actions");
const { FIXTURES } = await import("@/lib/ngn/fixtures");
const { emptyMultipleChoiceForm } = await import("@/lib/authoring/forms/multipleChoice");

const idle = { status: "idle" } as never;

const CALLS: Call[] = [
  ["createBank", () => author.createBank(idle, filled)],
  ["renameBank", () => author.renameBank(ID, idle, filled)],
  ["createCaseStudyInBank", () => author.createCaseStudyInBank(ID, idle, filled)],
  ["createFolderInBank", () => author.createFolderInBank(ID, null, idle, filled)],
  ["renameFolderInBank", () => author.renameFolderInBank(ID, ID2, idle, filled)],
  ["deleteFolderInBank", () => author.deleteFolderInBank(ID, ID2)],
  ["moveToFolderInBank", () => author.moveToFolderInBank(ID, idle, filled)],
  ["createItem", () => author.createItem(ID, "multiple_choice")],
  ["saveQuizOrderAction", () => quizOrder.saveQuizOrderAction(ID, idle, filled)],
  [
    "saveMultipleChoiceDraft",
    () => items.saveMultipleChoiceDraft(ID, emptyMultipleChoiceForm(ID2)),
  ],
  [
    "publishMultipleChoice",
    () => items.publishMultipleChoice(ID, FIXTURES.multiple_choice.canonical),
  ],
  ["startAiImport", () => aiImport.startAiImport(ID, true)],
  ["registerAiImportFile", () => aiImport.registerAiImportFile(ID, "notes.pdf")],
  ["checkAiImportFile", () => aiImport.checkAiImportFile(ID, ID2)],
  ["removeAiImportFile", () => aiImport.removeAiImportFile(ID, ID2)],
  ["beginAiImportReading", () => aiImport.beginAiImportReading(ID)],
  ["finishAiImport", () => aiImport.finishAiImport(ID)],
  ["dropAiImportEntry", () => aiImport.dropAiImportEntry({ batchId: ID, entryId: ID2 } as never)],
  [
    "restoreAiImportEntry",
    () => aiImport.restoreAiImportEntry({ batchId: ID, entryId: ID2 } as never),
  ],
  ["importAiImportBatch", () => aiImport.importAiImportBatch({ batchId: ID })],
  ["discardAiImportBatch", () => aiImport.discardAiImportBatch({ batchId: ID })],
  ["saveAiImportEntryFix", () => aiFix.saveAiImportEntryFix({ batchId: ID, entryId: ID2 })],
  ["createClass", () => classes.createClass(idle, filled)],
  ["renameClass", () => classes.renameClass(ID, idle, filled)],
  ["setTimeZone", () => classes.setTimeZone(ID, idle, filled)],
  ["rotateInvite", () => classes.rotateInvite(ID)],
  ["removeStudent", () => classes.removeStudent(ID, ID2)],
  ["importSample", () => onboarding.importSample()],
  ["createLibraryFolderAction", () => library.createLibraryFolderAction(null, idle, filled)],
  ["renameLibraryFolderAction", () => library.renameLibraryFolderAction(ID, idle, filled)],
  ["deleteLibraryFolderAction", () => library.deleteLibraryFolderAction(ID)],
  ["moveQuizzesAction", () => library.moveQuizzesAction(idle, filled)],
  ["createQuizInFolderAction", () => library.createQuizInFolderAction(ID, idle, filled)],
  ["archiveItemAction", () => archive.archiveItemAction(ID)],
  ["restoreItemAction", () => archive.restoreItemAction(ID)],
  ["archiveCaseStudyAction", () => archive.archiveCaseStudyAction(ID)],
  ["archiveSelectedAction", () => archive.archiveSelectedAction(ID, idle, filled)],
  ["restoreCaseStudyAction", () => archive.restoreCaseStudyAction(ID)],
  ["duplicateItemAction", () => duplicate.duplicateItemAction(ID)],
  ["duplicateCaseStudyAction", () => duplicate.duplicateCaseStudyAction(ID)],
  ["shareBankWithClass", () => practice.shareBankWithClass(ID, idle, filled)],
  ["shareClassWithBank", () => practice.shareClassWithBank(ID, idle, filled)],
  ["stopSharing", () => practice.stopSharing(ID, ID2)],
  ["saveCaseStudyRecord", () => caseStudies.saveCaseStudyRecord(ID, {})],
  ["startStepItem", () => caseStudies.startStepItem(ID, 1, "multiple_choice")],
  ["publishCaseStudyAction", () => caseStudies.publishCaseStudyAction(ID)],
  ["moveToQuizAction", () => quizMove.moveToQuizAction(ID, idle, filled)],
  ["turnFolderIntoQuizAction", () => quizMove.turnFolderIntoQuizAction(ID, ID2)],
  ["assignSource", () => assignments.assignSource({ kind: "bank", id: ID } as never, idle, filled)],
  ["editAssignment", () => assignments.editAssignment(ID, ID2, false, idle, filled)],
  ["deleteAssignment", () => assignments.deleteAssignment(ID, ID2)],
  ["inviteColleague", () => workspace.inviteColleague(idle, filled)],
  ["resendInvite", () => workspace.resendInvite(ID)],
  ["startLiveSession", () => live.startLiveSession(ID, filled)],
  ["startCaseStudyLiveSession", () => live.startCaseStudyLiveSession(ID, filled)],
  ["startClassLiveSession", () => live.startClassLiveSession(ID, filled)],
];

const AI_IMPORT = new Set([
  "startAiImport",
  "registerAiImportFile",
  "checkAiImportFile",
  "removeAiImportFile",
  "beginAiImportReading",
  "finishAiImport",
  "dropAiImportEntry",
  "restoreAiImportEntry",
  "importAiImportBatch",
  "discardAiImportBatch",
  "saveAiImportEntryFix",
]);

/** Runs one call to its end, whatever it throws, and says where it went. */
async function outcome(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.startsWith("redirect:") ? message.slice("redirect:".length) : null;
  }
}

beforeEach(() => {
  touched.mockClear();
  state.readOnly = null;
});

describe("a read-only workspace's writes are refused on the server (#521)", () => {
  it.each(CALLS)("%s sends a lapsed teacher to the read-only page", async (_name, run) => {
    state.readOnly = { readOnly: true, canManage: true };
    const where = await outcome(run);
    expect(where).toMatch(/^\/author\/read-only\?next=%2F(author|live)/);
    expect(touched).not.toHaveBeenCalled();
  });

  it.each(CALLS)("%s is not refused when billing is not enforced", async (_name, run) => {
    const where = await outcome(run);
    expect(where ?? "").not.toMatch(/^\/author\/read-only/);
  });

  // Most go on to the database straight away; AI import first asks its deployment switch, which
  // is off here, so it stops before the database whether enforced or not.
  it.each(CALLS.filter(([name]) => !AI_IMPORT.has(name)))(
    "%s goes on to the database when billing is not enforced",
    async (_name, run) => {
      await outcome(run);
      expect(touched).toHaveBeenCalled();
    },
  );
});
