import { describe, expect, it } from "vitest";
import { AI_IMPORT_BUCKET } from "@/lib/aiImport/files/store";
import { MAX_BATCH_PAGES, MAX_FILE_BYTES, MAX_FILES_PER_BATCH } from "@/lib/aiImport/files/limits";
import { MAX_ENTRIES_PER_BATCH } from "@/lib/aiImport/config";
import {
  AI_IMPORT_MAX_FILES,
  AI_IMPORT_MAX_FILE_BYTES,
  AI_IMPORT_MAX_PAGES,
  AI_IMPORT_MAX_QUESTIONS,
  AI_IMPORT_MESSAGES,
  AI_IMPORT_UPLOAD_BUCKET,
  HOLD_STAGES,
  allowanceLine,
  checkChosenFiles,
  describeFile,
  describeOpenImport,
  fileProgress,
  fileSizeLabel,
  messageFor,
  runPool,
  trackFile,
  type TrackedFile,
} from "./aiImportUpload";

const ready = (over: Partial<TrackedFile> = {}): TrackedFile => ({
  ...trackFile({
    id: "f1",
    name: "Cardiac.md",
    status: "ready",
    reason: null,
    pages: 3,
    chunks: [
      { position: 0, status: "done" },
      { position: 1, status: "pending" },
    ],
    questions: 0,
  }),
  ...over,
});

describe("the browser's copy of the limits", () => {
  it("matches the server's", () => {
    expect(AI_IMPORT_MAX_FILES).toBe(MAX_FILES_PER_BATCH);
    expect(AI_IMPORT_MAX_FILE_BYTES).toBe(MAX_FILE_BYTES);
    expect(AI_IMPORT_MAX_PAGES).toBe(MAX_BATCH_PAGES);
    expect(AI_IMPORT_MAX_QUESTIONS).toBe(MAX_ENTRIES_PER_BATCH);
    expect(AI_IMPORT_UPLOAD_BUCKET).toBe(AI_IMPORT_BUCKET);
  });
});

describe("checkChosenFiles", () => {
  it("accepts the four formats within the limits", () => {
    const files = ["a.pdf", "b.DOCX", "c.md", "d.txt"].map((name) => ({ name, size: 10 }));
    expect(checkChosenFiles(files, 5)).toEqual([]);
  });

  it("names each problem before anything is uploaded", () => {
    expect(checkChosenFiles([], 5)).toEqual(["Choose at least one file."]);
    expect(
      checkChosenFiles(
        [
          { name: "old.doc", size: 10 },
          { name: "empty.md", size: 0 },
          { name: "huge.pdf", size: MAX_FILE_BYTES + 1 },
        ],
        2,
      ),
    ).toEqual([
      "An import holds at most 5 files. Choose 2 or fewer.",
      "old.doc: use a PDF, a Word .docx, Markdown or text file.",
      "empty.md: the file is empty.",
      "huge.pdf: the file is larger than 25 MB.",
    ]);
    expect(checkChosenFiles([{ name: "a.md", size: 1 }], 0)).toEqual([
      "This import already has 5 files.",
    ]);
  });
});

describe("allowanceLine", () => {
  it("counts documents at about $0.25 each, with pages when a page cap is set", () => {
    expect(allowanceLine(10, null)).toBe("About 40 documents left this month.");
    expect(allowanceLine(0.3, 1)).toBe("About 1 document left this month. 1 page left.");
    expect(allowanceLine(0.3, 12)).toBe("About 1 document left this month. 12 pages left.");
    expect(allowanceLine(0.1, 50)).toBe(
      "Your workspace has used this month's AI import allowance.",
    );
  });
});

describe("messageFor", () => {
  it("has words for every code, and a fallback for one it does not know", () => {
    expect(messageFor("cap_reached")).toBe(AI_IMPORT_MESSAGES.cap_reached);
    expect(messageFor("toString")).toBe(AI_IMPORT_MESSAGES.unavailable);
    for (const message of Object.values(AI_IMPORT_MESSAGES)) {
      // Plain words: no emoji, no code names.
      expect(message).not.toMatch(/\p{Extended_Pictographic}|_/u);
    }
  });

  it("says nothing was charged only where nothing was (#590)", () => {
    // A call Claude never answered bills nothing. One that ran and failed was billed.
    const charged = Object.entries(AI_IMPORT_MESSAGES).filter(([, message]) =>
      /nothing (more )?was charged/i.test(message),
    );
    expect(charged.map(([code]) => code).sort()).toEqual(["cap_reached", "claude_failed"]);
    for (const code of ["claude_timeout", "claude_refused", "too_long", "part_too_large"]) {
      expect(messageFor(code)).not.toBe(AI_IMPORT_MESSAGES.unavailable);
      expect(messageFor(code)).not.toMatch(/Claude is unavailable/);
    }
    expect(messageFor("part_too_large")).toMatch(/split the file/i);
  });
});

describe("describeFile and fileProgress", () => {
  it("reads, then finds questions, then is done", () => {
    expect(describeFile(ready(), "parsing")).toEqual({
      stage: "Reading: 1 of 2 parts read.",
      tone: "working",
      progress: 0.3,
    });
    expect(
      describeFile(ready({ units: { done: 1, total: 4 }, questions: 2 }), "parsing").stage,
    ).toBe("Finding questions: 1 of 4 parts done, 2 questions so far.");
    expect(describeFile(ready({ units: { done: 4, total: 4 }, questions: 1 }), "parsing")).toEqual({
      stage: "Done: 1 question found.",
      tone: "done",
      progress: 1,
    });
    expect(describeFile(ready(), "review").tone).toBe("done");
  });

  it("names a refused file, a failure and a file left unuploaded", () => {
    expect(describeFile(ready({ status: "rejected", reason: "Too big." }), "uploading")).toEqual({
      stage: "Too big.",
      tone: "refused",
      progress: 1,
    });
    expect(describeFile(ready({ status: "local", reason: null }), "uploading").stage).toBe(
      AI_IMPORT_MESSAGES.unavailable,
    );
    expect(describeFile(ready({ failed: "Claude is down." }), "parsing").tone).toBe("refused");
    expect(describeFile(ready({ status: "pending" }), "uploading")).toMatchObject({
      stage: AI_IMPORT_MESSAGES.not_uploaded,
      tone: "refused",
    });
    expect(
      describeFile(ready({ status: "pending", note: "Uploading." }), "uploading"),
    ).toMatchObject({ stage: "Uploading.", tone: "working" });
    expect(describeFile(ready({ pages: 1 }), "uploading").stage).toBe(
      "Uploaded and checked. 1 page.",
    );
    expect(describeFile(ready({ pages: null }), "uploading").stage).toBe("Uploaded and checked.");
  });

  it("weighs reading and extracting", () => {
    expect(fileProgress({ status: "pending", chunks: [] }, null)).toBe(0);
    expect(fileProgress({ status: "ready", chunks: [] }, { done: 1, total: 2 })).toBe(0.2);
  });

  // #591: a wait of minutes is said, with about how long, and so is a new try.
  it("says a file is waiting or being tried again, and a failure over either", () => {
    expect(describeFile(ready({ held: "waiting" }), "parsing")).toEqual({
      stage: "Waiting to read part of this file. This can take up to 6 minutes.",
      tone: "working",
      progress: 0.3,
    });
    expect(describeFile(ready({ held: "retrying" }), "parsing").stage).toBe(HOLD_STAGES.retrying);
    expect(describeFile(ready({ held: "waiting", failed: "No." }), "parsing").stage).toBe("No.");
  });
});

describe("fileSizeLabel", () => {
  it("names a size in the largest unit that reads well", () => {
    expect(fileSizeLabel(28)).toBe("28 bytes");
    expect(fileSizeLabel(340 * 1024)).toBe("340 KB");
    expect(fileSizeLabel(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});

describe("describeOpenImport", () => {
  it("links an import in review to its review, with the count in the link", () => {
    expect(describeOpenImport("q1", { id: "b1", status: "review", questions: 12 })).toEqual({
      text: "An import is waiting for review.",
      action: "Review 12 questions",
      href: "/author/banks/q1/ai-import/b1",
    });
    expect(describeOpenImport("q1", { id: "b1", status: "review", questions: 1 }).action).toBe(
      "Review 1 question",
    );
  });

  it("links an import still uploading or reading back to the upload page", () => {
    for (const status of ["uploading", "parsing"] as const) {
      expect(describeOpenImport("q1", { id: "b2", status, questions: 3 })).toEqual({
        text: "An import is not finished.",
        action: "Continue the import",
        href: "/author/banks/q1/ai-import?batch=b2",
      });
    }
  });
});

describe("runPool", () => {
  it("runs at most `limit` at once and keeps the order of results", async () => {
    let running = 0;
    let most = 0;
    const tasks = [30, 10, 20, 5].map((ms, index) => async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return index;
    });
    expect(await runPool(tasks, 2)).toEqual([0, 1, 2, 3]);
    expect(most).toBe(2);
    expect(await runPool([], 3)).toEqual([]);
  });
});
