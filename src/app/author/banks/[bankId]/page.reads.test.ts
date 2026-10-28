import { beforeEach, describe, expect, it, vi } from "vitest";
import { roundTrips } from "@/lib/testing/roundTrips";

/**
 * perf-audit #13: how many round trips in a row the quiz page waits on. Every read is faked as a
 * trip (see `roundTrips`); the page's own logic runs for real. The quiz row, its folders and the
 * reads that need neither start together once the author is known.
 */

const BANK = "00000000-0000-4000-8000-0000000000b1";
const FOLDER = "00000000-0000-4000-8000-0000000000f1";

let rt = roundTrips();
let bankRow: { id: string; name: string } | null;
let folders: { id: string; parentId: string | null; name: string }[];

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const supabase = {
  from: (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const step of ["select", "eq"]) builder[step] = () => builder;
    builder.maybeSingle = () => rt.trip(table, () => ({ data: bankRow, error: null }));
    return builder;
  },
};

vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: () => rt.trip("auth", { supabase, orgId: "org", userId: "u", email: "" }),
}));
vi.mock("@/lib/aiImport/config", () => ({ aiImportEnabled: () => false }));
vi.mock("@/lib/aiImport/upload/access", () => ({ workspaceEnabled: async () => false }));
vi.mock("@/lib/authoring/folderData", () => ({
  listFolders: () => rt.trip("folders", () => folders),
}));
vi.mock("@/lib/authoring/libraryData", () => ({
  quizLibraryTrail: () => rt.trip("libraryTrail", []),
}));
vi.mock("@/lib/supabase/practiceShares", () => ({
  listBankShares: () => rt.trip("shares", []),
}));
vi.mock("@/lib/supabase/classes", () => ({ listClasses: () => rt.trip("classes", []) }));
vi.mock("@/lib/authoring/quizMoveData", () => ({
  readMoveContext: () => rt.trip("moveContext", null),
}));
vi.mock("@/lib/authoring/banks", () => ({
  listItems: () => rt.trip("items", { items: [], total: 0, pageCount: 1 }),
  listCaseStudies: () => rt.trip("caseStudies", []),
  listTaggedRows: () => rt.trip("taggedRows", []),
}));

const action = () => vi.fn();
vi.mock("@/app/author/actions", () => ({
  createCaseStudyInBank: action(),
  createFolderInBank: action(),
  deleteFolderInBank: action(),
  moveToFolderInBank: action(),
  renameBank: action(),
  renameFolderInBank: action(),
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
vi.mock("@/app/author/practice/actions", () => ({
  shareBankWithClass: action(),
  stopSharing: action(),
}));
vi.mock("@/app/live/actions", () => ({ startLiveSession: action() }));

const { default: BankPage } = await import("./page");

const render = (query: Record<string, string> = {}) =>
  rt.run(() =>
    BankPage({
      params: Promise.resolve({ bankId: BANK }),
      searchParams: Promise.resolve(query),
    } as never),
  );

beforeEach(() => {
  rt = roundTrips();
  bankRow = { id: BANK, name: "Cardiac week" };
  folders = [];
});

describe("the quiz page's round trips (perf-audit #13)", () => {
  it("reads the quiz row beside its folders and the view-free reads: 3 trips in a row, not 4", async () => {
    const result = await render();
    expect(result.ok).toBe(true);
    expect(rt.waveOf("auth")).toBe(1);
    for (const read of [
      "item_banks",
      "folders",
      "libraryTrail",
      "shares",
      "classes",
      "moveContext",
    ]) {
      expect(rt.waveOf(read)).toBe(2);
    }
    for (const read of ["items", "caseStudies", "taggedRows"]) expect(rt.waveOf(read)).toBe(3);
    expect(result.waves).toBe(3);
    // Each read once.
    expect(rt.log).toHaveLength(10);
  });

  it("is still a 404 for a quiz this author cannot see, whatever the other reads say", async () => {
    bankRow = null;
    folders = [{ id: FOLDER, parentId: null, name: "Week 1" }];
    const result = await render({ folder: FOLDER });
    expect(result.ok).toBe(false);
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
    // Nothing that needs the view is read.
    expect(rt.waveOf("items")).toBeUndefined();
  });

  it("is still a 404 for a folder view in a quiz with no folders", async () => {
    const result = await render({ folder: FOLDER });
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
  });
});
