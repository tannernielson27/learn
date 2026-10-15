import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchView } from "@/lib/authoring/aiImportUpload";
import { AiImportUpload, type AiImportActions } from "./AiImportUpload";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
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
  };
}

beforeEach(() => {
  replace.mockReset();
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
        quizName="Cardiac"
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

  it("uploads, reads each part and finds the questions, then refreshes for review", async () => {
    const act = actions();
    render(
      <AiImportUpload
        bankId={BANK}
        quizName="Cardiac"
        allowance={null}
        initial={null}
        actions={act}
      />,
    );
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
    render(
      <AiImportUpload
        bankId={BANK}
        quizName="Cardiac"
        allowance={null}
        initial={ready}
        actions={actions()}
      />,
    );
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
    render(
      <AiImportUpload
        bankId={BANK}
        quizName="Cardiac"
        allowance={null}
        initial={null}
        actions={act}
      />,
    );
    await userEvent.upload(screen.getByLabelText("Documents"), file);
    fireEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Upload and read" }));
    expect(await screen.findByText("The file has no text to import.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Add at least one file");
    await userEvent.click(screen.getByRole("button", { name: "Remove Cardiac.md" }));
    expect(act.remove).toHaveBeenCalledWith("b1", "f1");
    await waitFor(() => expect(screen.queryByText("Cardiac.md")).toBeNull());
  });
});
