import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  FOLDER_NAME_MAX,
  folderContentsMessage,
  folderOptions,
  folderTrail,
  folderWriteError,
  MAX_FOLDER_DEPTH,
  MOVE_LIMIT,
  moveSummary,
  parseFolderName,
  parseFolderView,
  parseMoveForm,
  type FolderRow,
} from "./folders";

const CARDIAC = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e01";
const HEART_FAILURE = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e02";
const RESPIRATORY = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e03";
const ASTHMA = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e04";
const ITEM_1 = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f01";
const ITEM_2 = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f02";
const CASE_1 = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";

const rows: FolderRow[] = [
  { id: RESPIRATORY, parentId: null, name: "Respiratory" },
  { id: HEART_FAILURE, parentId: CARDIAC, name: "Heart failure" },
  { id: ASTHMA, parentId: RESPIRATORY, name: "Asthma" },
  { id: CARDIAC, parentId: null, name: "Cardiac" },
];

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("buildFolderTree", () => {
  it("nests folders under their parents, sorted by name, with each one's path", () => {
    expect(buildFolderTree(rows)).toEqual([
      {
        id: CARDIAC,
        name: "Cardiac",
        path: "Cardiac",
        children: [
          { id: HEART_FAILURE, name: "Heart failure", path: "Cardiac/Heart failure", children: [] },
        ],
      },
      {
        id: RESPIRATORY,
        name: "Respiratory",
        path: "Respiratory",
        children: [{ id: ASTHMA, name: "Asthma", path: "Respiratory/Asthma", children: [] }],
      },
    ]);
  });

  it("sorts names with numbers the way a person would", () => {
    const numbered: FolderRow[] = [
      { id: "a", parentId: null, name: "Week 10" },
      { id: "b", parentId: null, name: "Week 2" },
    ];
    expect(buildFolderTree(numbered).map((node) => node.name)).toEqual(["Week 2", "Week 10"]);
  });

  it("leaves out a folder whose parent it was not given, rather than showing it at the top", () => {
    const orphan: FolderRow[] = [{ id: "x", parentId: "missing", name: "Lost" }];
    expect(buildFolderTree(orphan)).toEqual([]);
  });
});

describe("folderTrail", () => {
  it("lists a folder's ancestors from the top down, ending with the folder", () => {
    expect(folderTrail(rows, HEART_FAILURE).map((row) => row.name)).toEqual([
      "Cardiac",
      "Heart failure",
    ]);
  });

  it("is empty for a folder it does not know", () => {
    expect(folderTrail(rows, "unknown")).toEqual([]);
  });

  it("stops rather than looping if the rows ever describe a cycle", () => {
    const cyclic: FolderRow[] = [
      { id: "a", parentId: "b", name: "A" },
      { id: "b", parentId: "a", name: "B" },
    ];
    expect(folderTrail(cyclic, "a").length).toBeLessThanOrEqual(2);
  });
});

describe("folderOptions", () => {
  it("lists every folder by path, in tree order, for a move", () => {
    expect(folderOptions(rows)).toEqual([
      { id: CARDIAC, path: "Cardiac", depth: 1 },
      { id: HEART_FAILURE, path: "Cardiac/Heart failure", depth: 2 },
      { id: RESPIRATORY, path: "Respiratory", depth: 1 },
      { id: ASTHMA, path: "Respiratory/Asthma", depth: 2 },
    ]);
  });
});

describe("parseFolderView", () => {
  it("reads a folder id", () => {
    expect(parseFolderView(CARDIAC)).toEqual({ kind: "folder", id: CARDIAC });
  });

  it("reads Unfiled", () => {
    expect(parseFolderView("unfiled")).toEqual({ kind: "unfiled" });
  });

  it.each([[undefined], [""], ["not-an-id"], [[CARDIAC, RESPIRATORY]]])(
    "shows everything for %j",
    (value) => {
      expect(parseFolderView(value)).toEqual({ kind: "all" });
    },
  );
});

describe("parseFolderName", () => {
  it("trims the name and closes up runs of spaces", () => {
    expect(parseFolderName(form([["name", "  Heart   failure "]]))).toEqual({
      ok: true,
      name: "Heart failure",
    });
  });

  it.each([
    ["a missing name", [], "Name the folder."],
    ["a blank name", [["name", "   "]], "Name the folder."],
    ["a slash", [["name", "Cardiac/Renal"]], "A folder name cannot contain a slash (/)."],
    [
      "a long name",
      [["name", "x".repeat(FOLDER_NAME_MAX + 1)]],
      `Keep the folder name to ${FOLDER_NAME_MAX} characters or fewer.`,
    ],
  ] as [string, [string, string][], string][])("refuses %s", (_name, entries, error) => {
    expect(parseFolderName(form(entries))).toEqual({ ok: false, error });
  });
});

describe("parseMoveForm", () => {
  it("reads the chosen folder and the selected items and case studies, once each", () => {
    expect(
      parseMoveForm(
        form([
          ["folder", CARDIAC],
          ["item", ITEM_1],
          ["item", ITEM_2],
          ["item", ITEM_1],
          ["caseStudy", CASE_1],
        ]),
      ),
    ).toEqual({ ok: true, folderId: CARDIAC, itemIds: [ITEM_1, ITEM_2], caseStudyIds: [CASE_1] });
  });

  it("reads Unfiled as no folder", () => {
    expect(
      parseMoveForm(
        form([
          ["folder", "unfiled"],
          ["item", ITEM_1],
        ]),
      ),
    ).toEqual({
      ok: true,
      folderId: null,
      itemIds: [ITEM_1],
      caseStudyIds: [],
    });
  });

  it("asks for a folder when none is chosen", () => {
    expect(parseMoveForm(form([["item", ITEM_1]]))).toEqual({
      ok: false,
      error: "Choose a folder to move to.",
    });
  });

  it("asks for a selection when nothing is selected", () => {
    expect(parseMoveForm(form([["folder", CARDIAC]]))).toEqual({
      ok: false,
      error: "Select at least one item or case study to move.",
    });
  });

  it("refuses a selection it cannot read, without repeating it", () => {
    const result = parseMoveForm(
      form([
        ["folder", CARDIAC],
        ["item", "'; drop table items"],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: "That selection could not be read. Reload the page and try again.",
    });
  });

  it(`moves at most ${MOVE_LIMIT} at a time`, () => {
    const many = Array.from(
      { length: MOVE_LIMIT + 1 },
      (_, index) =>
        ["item", `6e4d4a8f-2b3c-4d5e-9f60-${index.toString(16).padStart(12, "0")}`] as [
          string,
          string,
        ],
    );
    expect(parseMoveForm(form([["folder", CARDIAC], ...many]))).toEqual({
      ok: false,
      error: `Move at most ${MOVE_LIMIT} at a time.`,
    });
  });
});

describe("parseMoveForm bounds", () => {
  it("refuses an oversized selection before reading any of its ids", () => {
    const flood = Array.from({ length: 10_000 }, () => ["item", "not-an-id"] as [string, string]);
    expect(parseMoveForm(form([["folder", CARDIAC], ...flood]))).toEqual({
      ok: false,
      error: `Move at most ${MOVE_LIMIT} at a time.`,
    });
  });
});

describe("folderContentsMessage", () => {
  it("is null for an empty folder", () => {
    expect(folderContentsMessage("Cardiac", { items: 0, caseStudies: 0, folders: 0 })).toBeNull();
  });

  it("says what is inside, with each count named", () => {
    expect(folderContentsMessage("Cardiac", { items: 3, caseStudies: 1, folders: 2 })).toBe(
      '"Cardiac" holds 3 items, 1 case study and 2 folders. Move or delete them first.',
    );
  });

  it("names only what is there", () => {
    expect(folderContentsMessage("Cardiac", { items: 1, caseStudies: 0, folders: 0 })).toBe(
      '"Cardiac" holds 1 item. Move or delete it first.',
    );
    expect(folderContentsMessage("Cardiac", { items: 0, caseStudies: 2, folders: 1 })).toBe(
      '"Cardiac" holds 2 case studies and 1 folder. Move or delete them first.',
    );
  });
});

describe("moveSummary", () => {
  it("says how many items moved and where", () => {
    expect(moveSummary({ items: 5, caseStudies: 0 }, "Cardiac")).toBe("Moved 5 items to Cardiac.");
  });

  it("names items and case studies together, and Unfiled as a destination", () => {
    expect(moveSummary({ items: 1, caseStudies: 2 }, "Unfiled")).toBe(
      "Moved 1 item and 2 case studies to Unfiled.",
    );
  });

  it("says when nothing moved", () => {
    expect(moveSummary({ items: 0, caseStudies: 0 }, "Cardiac")).toBe(
      "Nothing was moved. Reload the page and try again.",
    );
  });
});

describe("folderWriteError", () => {
  it("names a duplicate folder", () => {
    expect(folderWriteError("23505", "Cardiac")).toBe(
      'There is already a folder named "Cardiac" here.',
    );
  });

  it("explains the depth limit", () => {
    expect(folderWriteError("23514", "Too deep")).toBe(
      `Folders go at most ${MAX_FOLDER_DEPTH} levels deep.`,
    );
  });

  it("covers a folder that changed under the author", () => {
    expect(folderWriteError("23503", "Cardiac")).toBe(
      "That folder has changed since this page loaded. Reload the page and try again.",
    );
  });

  it("leaves other failures to the caller's own message", () => {
    expect(folderWriteError("42501", "Cardiac")).toBeNull();
    expect(folderWriteError(undefined, "Cardiac")).toBeNull();
  });
});

describe("limits", () => {
  it("matches the database's depth limit", () => {
    expect(MAX_FOLDER_DEPTH).toBe(4);
  });
});
