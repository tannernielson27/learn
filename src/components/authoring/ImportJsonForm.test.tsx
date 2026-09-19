import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileImportResult } from "@/lib/authoring/bulkImport";
import type { FolderRow } from "@/lib/authoring/folders";
import { ImportJsonForm } from "./ImportJsonForm";

const CARDIAC = "00000000-0000-4000-8000-000000000031";
const folders: FolderRow[] = [{ id: CARDIAC, parentId: null, name: "Cardiac" }];

const DONE: FileImportResult = { status: "done", message: "Imported 40 items as drafts." };

function setup(
  results: FileImportResult | ((data: FormData) => Promise<FileImportResult>),
  props: { defaultFolderId?: string } = {},
) {
  const action = vi.fn<(data: FormData) => Promise<FileImportResult>>(
    typeof results === "function" ? results : async () => results,
  );
  render(<ImportJsonForm action={action} folders={folders} {...props} />);
  return { action, user: userEvent.setup() };
}

const jsonFile = (name: string, text = '{"format":"learn.v1","items":[]}') =>
  new File([text], name, { type: "application/json" });

describe("ImportJsonForm", () => {
  it("takes several JSON files, or JSON pasted in, and a folder to import into", () => {
    setup(DONE);
    const input = screen.getByLabelText("JSON files");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
    expect(screen.getByRole("textbox", { name: "Or paste JSON" })).toBeInTheDocument();
    const folder = screen.getByRole("combobox", { name: "Import into" });
    expect(
      within(folder)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Unfiled", "Cardiac"]);
    expect(folder).toHaveValue("unfiled");
  });

  it("starts on the open folder", () => {
    setup(DONE, { defaultFolderId: CARDIAC });
    expect(screen.getByRole("combobox", { name: "Import into" })).toHaveValue(CARDIAC);
  });

  it("sends each file in its own request, with the chosen folder", async () => {
    const { action, user } = setup(DONE);
    await user.selectOptions(screen.getByRole("combobox", { name: "Import into" }), "Cardiac");
    await user.upload(screen.getByLabelText("JSON files"), [
      jsonFile("a.json"),
      jsonFile("b.json"),
    ]);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Imported all 2 files into Cardiac.")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(2);
    const sent = action.mock.calls.map(([data]) => data);
    expect(sent.map((data) => (data.get("file") as File).name)).toEqual(["a.json", "b.json"]);
    expect(sent.every((data) => data.get("folder") === CARDIAC)).toBe(true);
    expect(sent.every((data) => data.get("json") === null)).toBe(true);
  });

  it("reports each file: a refused one names its problems and never stops the others", async () => {
    const { action, user } = setup(async (data) =>
      (data.get("file") as File).name === "broken.json"
        ? { status: "error", errors: ['Item 7: "stem.value" is not valid.'] }
        : DONE,
    );
    await user.upload(screen.getByLabelText("JSON files"), [
      jsonFile("one.json"),
      jsonFile("broken.json"),
      jsonFile("three.json"),
    ]);
    await user.click(screen.getByRole("button", { name: "Import" }));

    const report = await screen.findByRole("list", { name: "Imported files" });
    expect(
      within(report)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "one.json: Imported 40 items as drafts.",
      "three.json: Imported 40 items as drafts.",
    ]);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("broken.json: Nothing was imported.");
    expect(alert).toHaveTextContent('Item 7: "stem.value" is not valid.');
    expect(screen.getByText("Imported 2 of 3 files. 1 was refused.")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(3);
  });

  it("refuses an oversized file without sending it", async () => {
    const { action, user } = setup(DONE);
    const big = jsonFile("big.json");
    Object.defineProperty(big, "size", { value: 900_000 });
    await user.upload(screen.getByLabelText("JSON files"), [big, jsonFile("small.json")]);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "big.json: Nothing was imported.This import is too large.",
    );
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("says a file that could not be sent may still need checking, and goes on", async () => {
    const { action, user } = setup(async (data) => {
      if ((data.get("file") as File).name === "lost.json") throw new Error("offline");
      return DONE;
    });
    await user.upload(screen.getByLabelText("JSON files"), [
      jsonFile("lost.json"),
      jsonFile("b.json"),
    ]);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be sent");
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("list", { name: "Imported files" })).toHaveTextContent(
      "b.json: Imported 40 items as drafts.",
    );
  });

  it("sends what was pasted, and clears it once it has been imported", async () => {
    const { action, user } = setup({ status: "done", message: "Imported 1 item as a draft." });
    const box = screen.getByRole("textbox", { name: "Or paste JSON" });
    await user.click(box);
    await user.paste('{"format":"learn.v1","items":[]}');
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("list", { name: "Imported files" })).toHaveTextContent(
      "Pasted JSON: Imported 1 item as a draft.",
    );
    const sent = action.mock.calls[0]![0];
    expect(sent.get("json")).toBe('{"format":"learn.v1","items":[]}');
    expect(sent.get("file")).toBeNull();
    expect(sent.get("folder")).toBe("unfiled");
    expect(box).toHaveValue("");
  });

  it("keeps the pasted JSON when it is refused, so it can be fixed", async () => {
    const { user } = setup({ status: "error", errors: ["This is not valid JSON."] });
    const box = screen.getByRole("textbox", { name: "Or paste JSON" });
    await user.click(box);
    await user.paste("{ not json");
    await user.click(screen.getByRole("button", { name: "Import" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Pasted JSON: Nothing was imported.");
    expect(alert).toHaveTextContent("This is not valid JSON.");
    expect(box).toHaveValue("{ not json");
  });

  it("asks for something to import, without sending anything", async () => {
    const { action, user } = setup(DONE);
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nothing was imported.Choose JSON files or paste JSON to import.",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("clears the chosen files once they have been sent, so they cannot be imported twice", async () => {
    const { user } = setup(DONE);
    const input = screen.getByLabelText<HTMLInputElement>("JSON files");
    await user.upload(input, [jsonFile("a.json")]);
    await user.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText("Imported 1 file.");
    expect(input.value).toBe("");
  });
});
