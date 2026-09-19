import { describe, expect, it } from "vitest";
import {
  BULK_IMPORT_ERRORS,
  IMPORT_MAX_FILES,
  importLabel,
  PASTED_LABEL,
  planImport,
  reportSummary,
  type FileReport,
} from "./bulkImport";
import { IMPORT_ERRORS, IMPORT_MAX_BYTES } from "./transfer";

const file = (name: string, size = 100) => ({ name, size });

describe("planImport", () => {
  it("sends each file on its own, in the order chosen", () => {
    expect(planImport([file("a.json"), file("b.json")], "")).toEqual({
      ok: true,
      steps: [
        { kind: "file", index: 0, label: "a.json" },
        { kind: "file", index: 1, label: "b.json" },
      ],
    });
  });

  it("sends pasted JSON as one more import, after the files", () => {
    expect(planImport([file("a.json")], '{"format":"learn.v1"}')).toEqual({
      ok: true,
      steps: [
        { kind: "file", index: 0, label: "a.json" },
        { kind: "pasted", label: PASTED_LABEL },
      ],
    });
  });

  it("refuses an empty or oversized file without sending it, and still sends the rest", () => {
    const plan = planImport(
      [file("empty.json", 0), file("big.json", IMPORT_MAX_BYTES + 1), file("ok.json")],
      "   ",
    );
    expect(plan).toEqual({
      ok: true,
      steps: [
        { kind: "refused", label: "empty.json", errors: [BULK_IMPORT_ERRORS.empty] },
        { kind: "refused", label: "big.json", errors: [IMPORT_ERRORS.tooLarge] },
        { kind: "file", index: 2, label: "ok.json" },
      ],
    });
  });

  it("asks for something to import when there is nothing", () => {
    expect(planImport([], "  ")).toEqual({ ok: false, error: BULK_IMPORT_ERRORS.nothing });
  });

  it(`takes at most ${IMPORT_MAX_FILES} files at a time, counting pasted JSON`, () => {
    const files = Array.from({ length: IMPORT_MAX_FILES }, (_, index) => file(`${index}.json`));
    expect(planImport(files, "").ok).toBe(true);
    expect(planImport(files, "{}")).toEqual({ ok: false, error: BULK_IMPORT_ERRORS.tooMany });
    expect(planImport([...files, file("more.json")], "")).toEqual({
      ok: false,
      error: BULK_IMPORT_ERRORS.tooMany,
    });
  });
});

describe("importLabel", () => {
  it("keeps an ordinary file name", () => {
    expect(importLabel("cardiac-1.learn.json")).toBe("cardiac-1.learn.json");
  });

  it("drops control and direction characters, which could disguise a name", () => {
    const [override, nul, newline] = [0x202e, 0, 10].map((code) => String.fromCharCode(code));
    expect(importLabel(["evil", override, "nosj.exe", nul, newline].join(""))).toBe("evilnosj.exe");
  });

  it("shortens a very long name and names a blank one", () => {
    const label = importLabel(`${"a".repeat(200)}.json`);
    expect(label).toHaveLength(80);
    expect(label.endsWith("…")).toBe(true);
    expect(importLabel("  ")).toBe("Untitled file");
  });
});

describe("reportSummary", () => {
  const done = (label: string): FileReport => ({ label, status: "done", message: "Imported." });
  const refused = (label: string): FileReport => ({ label, status: "error", errors: ["No."] });

  it("says every file landed, and where", () => {
    expect(reportSummary([done("a"), done("b")], "Cardiac")).toBe(
      "Imported all 2 files into Cardiac.",
    );
    expect(reportSummary([done("a")], null)).toBe("Imported 1 file.");
  });

  it("says how many landed when some were refused", () => {
    expect(reportSummary([done("a"), refused("b"), done("c")], "Cardiac")).toBe(
      "Imported 2 of 3 files into Cardiac. 1 was refused.",
    );
    expect(reportSummary([done("a"), refused("b"), refused("c")], null)).toBe(
      "Imported 1 of 3 files. 2 were refused.",
    );
  });

  it("says nothing was imported when every file was refused", () => {
    expect(reportSummary([refused("a")], null)).toBe("Nothing was imported.");
    expect(reportSummary([refused("a"), refused("b")], "Cardiac")).toBe(
      "Nothing was imported from 2 files.",
    );
  });
});
