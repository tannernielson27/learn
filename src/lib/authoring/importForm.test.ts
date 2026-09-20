import { describe, expect, it } from "vitest";
import { IMPORT_FORM_ERRORS, readImportFolder, readImportText } from "./importForm";
import { UNFILED } from "./folders";
import { IMPORT_ERRORS, IMPORT_MAX_BYTES } from "./transfer";

const form = (entries: Record<string, string | File>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

describe("readImportText", () => {
  it("reads pasted JSON", async () => {
    expect(await readImportText(form({ json: '{"format":"learn.v1"}' }))).toEqual({
      ok: true,
      text: '{"format":"learn.v1"}',
    });
  });

  it("prefers a chosen file over pasted text", async () => {
    const file = new File(['{"from":"file"}'], "export.learn.json", { type: "application/json" });
    expect(await readImportText(form({ file, json: '{"from":"paste"}' }))).toEqual({
      ok: true,
      text: '{"from":"file"}',
    });
  });

  it("refuses a file that is too large without reading it", async () => {
    const file = new File(["x".repeat(IMPORT_MAX_BYTES + 1)], "big.json");
    expect(await readImportText(form({ file }))).toEqual({
      ok: false,
      error: IMPORT_ERRORS.tooLarge,
    });
  });

  it("asks for something to import when there is nothing", async () => {
    const empty = new File([], "");
    expect(await readImportText(form({ file: empty, json: "   " }))).toEqual({
      ok: false,
      error: IMPORT_FORM_ERRORS.nothing,
    });
  });
});

describe("readImportFolder", () => {
  const FOLDER_ID = "00000000-0000-4000-8000-000000000020";

  it("files the import in a chosen folder", () => {
    expect(readImportFolder(form({ folder: FOLDER_ID }))).toEqual({
      ok: true,
      folderId: FOLDER_ID,
    });
  });

  it("leaves the import unfiled when Unfiled is chosen, or no folder is sent", () => {
    expect(readImportFolder(form({ folder: UNFILED }))).toEqual({ ok: true, folderId: null });
    expect(readImportFolder(form({}))).toEqual({ ok: true, folderId: null });
  });

  it("refuses anything else as a folder that no longer exists", () => {
    expect(readImportFolder(form({ folder: "../other" }))).toEqual({
      ok: false,
      error: IMPORT_FORM_ERRORS.folderGone,
    });
  });
});
