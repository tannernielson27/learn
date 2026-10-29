import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.mjs";

describe("parseArgs", () => {
  it("reads issue with an address and a note, the address lower case", () => {
    expect(parseArgs(["issue", " Fay@School.edu ", " spring cohort "])).toEqual({
      command: "issue",
      email: "fay@school.edu",
      note: "spring cohort",
    });
  });

  it("refuses issue without exactly an address and a non-empty note", () => {
    expect(parseArgs(["issue", "fay@school.edu"])).toHaveProperty("error");
    expect(parseArgs(["issue", "fay@school.edu", "  "])).toHaveProperty("error");
    expect(parseArgs(["issue", "fay@school.edu", "a", "b"])).toHaveProperty("error");
    expect(parseArgs(["issue", "fay@school.edu", "x".repeat(501)])).toHaveProperty("error");
  });

  it("catches the note and the address swapped", () => {
    expect(parseArgs(["issue", "spring cohort", "fay@school.edu"])).toEqual({
      error: '"spring cohort" is not an email address.',
    });
  });

  it("reads list, and nothing after it", () => {
    expect(parseArgs(["list"])).toEqual({ command: "list" });
    expect(parseArgs(["list", "extra"])).toHaveProperty("error");
  });

  it("reads revoke with one address", () => {
    expect(parseArgs(["revoke", "Fay@School.edu"])).toEqual({
      command: "revoke",
      email: "fay@school.edu",
    });
    expect(parseArgs(["revoke"])).toHaveProperty("error");
    expect(parseArgs(["revoke", "not-an-address"])).toHaveProperty("error");
  });

  it("refuses anything else", () => {
    expect(parseArgs([])).toEqual({ error: "Name a command." });
    expect(parseArgs(["delete", "fay@school.edu"])).toEqual({ error: 'Unknown command "delete".' });
  });
});
