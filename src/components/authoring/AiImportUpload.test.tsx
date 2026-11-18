import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchView } from "@/lib/authoring/aiImportUpload";
import { AiImportUpload, type AiImportActions } from "./AiImportUpload";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
const requests = vi.hoisted(() => ({ postJson: vi.fn(), uploadToStorage: vi.fn() }));
vi.mock("./aiImportRequests", () => requests);

const BANK = "00000000-0000-4000-8000-0000000000d1";
const ready: BatchView = {
  id: "b1",
  status: "parsing",
  files: [
    {
      id: "f1",
      name: "Cardiac.md",
      status: "ready",
      reason: null,
      pages: 1,
      chunks: [{ position: 0, status: "pending" }],
      questions: 0,
    },
  ],
};

function actions(): AiImportActions {
  return {
    start: vi.fn(async () => ({ ok: true as const, batchId: "b1" })),
    register: vi.fn(async () => ({
      ok: true as const,
      fileId: "f1",
      storagePath: "o/b1/f1",
      contentType: "text/markdown",
      name: "Cardiac.md",
    })),
    check: vi.fn(async () => ({
      ok: true as const,
      status: "ready" as const,
      pages: 1,
      chunks: 1,
    })),
    remove: vi.fn(async () => ({ ok: true as const })),
    begin: vi.fn(async () => ({ ok: true as const, batch: ready })),
    finish: vi.fn(async () => ({ ok: true as const })),
    discard: vi.fn(async () => ({ ok: true as const })),
  };
}

/** Two files being read: the second is the one a test makes fail. */
const twoFiles: BatchView = {
  ...ready,
  files: [ready.files[0]!, { ...ready.files[0]!, id: "f2", name: "Renal.md" }],
};

const spent = {
  ok: false,
  code: "spent",
  message: "This part failed too many times. Remove the file, or discard this import.",
};

/** Every part of `f2` fails for good; everything else is read. */
function failSecondFile() {
  requests.postJson.mockImplementation(async (url: string, body: { fileId: string }) => {
    if (body.fileId === "f2") return spent;
    return url.endsWith("/parse")
      ? { ok: true, questions: 1, already: false }
      : { ok: true, units: 1, staged: 1, alreadyStaged: 0, overLimit: 0 };
  });
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  requests.uploadToStorage.mockReset().mockResolvedValue(true);
  requests.postJson
    .mockReset()
    .mockImplementation(async (url: string) =>
      url.endsWith("/parse")
        ? { ok: true, questions: 1, already: false }
        : { ok: true, units: 1, staged: 1, alreadyStaged: 0, overLimit: 0 },
    );
  window.history.replaceState(null, "", "/");
});

const file = new File(["## 1.\nWhich finding?\nA. One\n"], "Cardiac.md", { type: "text/markdown" });

describe("AiImportUpload", () => {
  it("asks for the rights confirmation before anything is sent", async () => {
    const act = actions();
    render(
      <AiImportUpload
        bankId={BANK}
        allowance={{ remainingUsd: 10, remainingPages: null }}
        initial={null}
        actions={act}
      />,
    );
    expect(screen.getByText("About 40 documents left this month.")).toBeTruthy();
    await userEvent.upload(screen.getByLabelText("Documents"), file);
    await userEvent.click(screen.getByRole("button", { name: "Upload and read" }));
    expect(screen.getByRole("alert").textContent).toContain("Confirm you may use this content");
    expect(act.start).not.toHaveBeenCalled();
  });

  // #349: what the AI will and will not do is in the teacher guide, one link away.
  it("links to the teacher guide's AI import section", () => {
    render(<AiImportUpload bankId={BANK} allowance={null} initial={null} actions={actions()} />);
    expect(screen.getByRole("link", { name: "How AI import works" })).toHaveAttribute(
      "href",
      "/help/instructor#ai-import",
    );
  });

  it("uploads, reads each part and finds the questions, then refreshes for review", async () => {
    const act = actions();
    render(<AiImportUpload bankId={BANK} allowance={null} initial={null} actions={act} />);
    await userEvent.upload(screen.getByLabelText("Documents"), file);
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I may use this content in my course/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload and read" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("?batch=b1", { scroll: false }));
    expect(act.start).toHaveBeenCalledWith(BANK, true);
    expect(requests.uploadToStorage).toHaveBeenCalledWith("o/b1/f1", file, "text/markdown");
    expect(act.check).toHaveBeenCalledWith("b1", "f1");
    expect(requests.postJson).toHaveBeenCalledWith("/api/ai-import/parse", {
      batchId: "b1",
      fileId: "f1",
      position: 0,
    });
    expect(act.finish).toHaveBeenCalledWith("b1");
    expect(window.location.search).toBe("?batch=b1");
    expect(screen.getByRole("heading", { name: "Ready for review" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("1 question is waiting for review");
    // #346: the review screen is one link away.
    expect(screen.getByRole("link", { name: "Review the questions" }).getAttribute("href")).toBe(
      `/author/banks/${BANK}/ai-import/b1`,
    );
  });

  it("carries on reading a batch it was reloaded on, and says why it stopped", async () => {
    requests.postJson.mockResolvedValue({
      ok: false,
      code: "cap_reached",
      message: "Your workspace has reached this month's AI import allowance.",
    });
    render(<AiImportUpload bankId={BANK} allowance={null} initial={ready} actions={actions()} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("reached this month's AI import allowance");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    const rows = screen.getByRole("list", { name: "Files" });
    expect(within(rows).getByText("Cardiac.md")).toBeTruthy();
    expect(within(rows).getByRole("progressbar", { name: "Cardiac.md progress" })).toBeTruthy();
  });

  it("names a file the server refused and lets it be removed", async () => {
    const act = actions();
    vi.mocked(act.check).mockResolvedValueOnce({
      ok: true,
      status: "rejected",
      reason: "The file has no text to import.",
    });
    vi.mocked(act.begin).mockResolvedValueOnce({
      ok: false,
      code: "no_files",
      message: "Add at least one file that can be imported.",
    });
    render(<AiImportUpload bankId={BANK} allowance={null} initial={null} actions={act} />);
    await userEvent.upload(screen.getByLabelText("Documents"), file);
    fireEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Upload and read" }));
    expect(await screen.findByText("The file has no text to import.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Add at least one file");
    await userEvent.click(screen.getByRole("button", { name: "Remove Cardiac.md" }));
    expect(act.remove).toHaveBeenCalledWith("b1", "f1");
    await waitFor(() => expect(screen.queryByText("Cardiac.md")).toBeNull());
  });

  // #591: what was chosen or dropped is listed before anything is sent.
  it("lists the chosen files with their sizes before the upload", async () => {
    render(<AiImportUpload bankId={BANK} allowance={null} initial={null} actions={actions()} />);
    expect(screen.queryByRole("list", { name: "Chosen files" })).toBeNull();
    await userEvent.upload(screen.getByLabelText("Documents"), file);
    const chosen = screen.getByRole("list", { name: "Chosen files" });
    expect(within(chosen).getByText("Cardiac.md")).toBeTruthy();
    expect(within(chosen).getByText(`${file.size} bytes`)).toBeTruthy();
    // Nothing is discarded before an import exists.
    expect(screen.queryByRole("button", { name: "Discard this import" })).toBeNull();
  });

  it("lists files dropped on the zone, which the input itself does not show", () => {
    render(<AiImportUpload bankId={BANK} allowance={null} initial={null} actions={actions()} />);
    const input = screen.getByLabelText("Documents");
    // jsdom's input takes only a FileList it made itself; a plain property stands in for it.
    Object.defineProperty(input, "files", { configurable: true, writable: true, value: null });
    fireEvent.drop(input.parentElement!, { dataTransfer: { files: [file] } });
    const chosen = screen.getByRole("list", { name: "Chosen files" });
    expect(within(chosen).getByText("Cardiac.md")).toBeTruthy();
    // The drop reaches the form through the input, as a choice in the picker does.
    expect((input as HTMLInputElement).files).toEqual([file]);
  });

  it("says the tab must stay open while it reads, and asks before the tab is closed", async () => {
    let release: (value: unknown) => void = () => {};
    requests.postJson.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    render(<AiImportUpload bankId={BANK} allowance={null} initial={ready} actions={actions()} />);
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Reading your files. Keep this tab open until it finishes.");
    const closing = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);

    release({ ok: false, code: "cap_reached", message: "The allowance is used." });
    await screen.findByRole("alert");
    // Nothing is in flight any more, so the tab closes without a question.
    const later = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it("says a file is waiting while a claim holds one of its parts", async () => {
    requests.postJson.mockResolvedValue({ ok: false, code: "busy", message: "Still reading." });
    render(<AiImportUpload bankId={BANK} allowance={null} initial={ready} actions={actions()} />);
    expect(
      await screen.findByText("Waiting to read part of this file. This can take up to 6 minutes."),
    ).toBeTruthy();
  });

  it("removes a file that failed while reading, and takes the rest on to review", async () => {
    failSecondFile();
    const act = actions();
    // After the removal the server answers the batch without the removed file.
    vi.mocked(act.begin).mockResolvedValue({ ok: true, batch: ready });
    render(<AiImportUpload bankId={BANK} allowance={null} initial={twoFiles} actions={act} />);

    expect(await screen.findByText(spent.message)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("remove them to review the rest");
    // One failed file holds the finish back, and only that file can be removed.
    expect(act.finish).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remove Cardiac.md" })).toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Renal.md" }));
    expect(act.remove).toHaveBeenCalledWith("b1", "f2");
    expect(await screen.findByRole("heading", { name: "Ready for review" })).toBeTruthy();
    expect(act.begin).toHaveBeenCalledWith("b1");
    expect(act.finish).toHaveBeenCalledWith("b1");
    expect(screen.queryByText("Renal.md")).toBeNull();
  });

  it("keeps a file the server would not remove, and says why", async () => {
    failSecondFile();
    const act = actions();
    vi.mocked(act.remove).mockResolvedValue({
      ok: false,
      code: "unavailable",
      message: "Something went wrong on our side. Try again in a minute.",
    });
    render(<AiImportUpload bankId={BANK} allowance={null} initial={twoFiles} actions={act} />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove Renal.md" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Something went wrong on our side"),
    );
    expect(screen.getByText("Renal.md")).toBeTruthy();
    expect(act.begin).not.toHaveBeenCalled();
  });

  it("says to discard when the last file is removed", async () => {
    requests.postJson.mockResolvedValue(spent);
    const act = actions();
    render(<AiImportUpload bankId={BANK} allowance={null} initial={ready} actions={act} />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove Cardiac.md" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No files are left in this import"),
    );
    expect(act.begin).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Discard this import" })).toBeTruthy();
  });

  it("discards the import from the upload page after confirming, and returns to the quiz", async () => {
    requests.postJson.mockResolvedValue(spent);
    const act = actions();
    render(<AiImportUpload bankId={BANK} allowance={null} initial={ready} actions={act} />);
    await screen.findByText(spent.message);
    await userEvent.click(screen.getByRole("button", { name: "Discard this import" }));
    // Pressing it changes nothing: the dialog's own button is the one that acts.
    expect(act.discard).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Discard this import?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(act.discard).toHaveBeenCalledWith({ batchId: "b1" });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/author/banks/${BANK}`));
  });

  it("offers discard on an import that is ready for review", () => {
    render(
      <AiImportUpload
        bankId={BANK}
        allowance={null}
        initial={{ ...ready, status: "review" }}
        actions={actions()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ready for review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard this import" })).toBeTruthy();
  });
});
