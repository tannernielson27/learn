import { describe, expect, it } from "vitest";
import { findProblems } from "./pgtap-verdict.mjs";

// Outputs below are trimmed from real `supabase test db` runs against the local stack (#163).
const FILE = "/repo/supabase/tests/database/authoring_rls.test.sql";

const PASSING = [
  "Connecting to local database...",
  `psql:${FILE}:4: NOTICE:  extension "pgtap" already exists, skipping`,
  `${FILE} ........ ok`,
  "All tests successful.",
  "Files=1, Tests=12,  0 wallclock secs ( 0.02 usr  0.02 sys +  0.00 cusr  0.01 csys =  0.05 CPU)",
  "Result: PASS",
].join("\n");

// The #161 shape: every `ok` line printed, so the harness passes, but a savepoint rollback took
// pgTAP's own counter with it and `finish()` says so in a comment the harness ignores.
const SAVEPOINT_ROLLBACK = [
  "Connecting to local database...",
  `${FILE} .. `,
  "# Looks like you planned 3 tests but ran 1",
  "ok",
  "All tests successful.",
  "Files=1, Tests=3,  1 wallclock secs ( 0.02 usr +  0.03 sys =  0.05 CPU)",
  "Result: PASS",
].join("\n");

const STOPPED_SHORT = [
  `${FILE} .. `,
  "# Looks like you planned 2 tests but ran 1",
  "Failed 1/2 subtests ",
  "",
  "Test Summary Report",
  "-------------------",
  `${FILE} (Wstat: 0 Tests: 1 Failed: 0)`,
  "  Parse errors: Bad plan.  You planned 2 tests but ran 1.",
  "Files=1, Tests=1,  0 wallclock secs",
  "Result: FAIL",
  "error running container: exit 1",
].join("\n");

const NO_PLAN = [
  `psql:${FILE}:4: ERROR:  You tried to run a test without a plan! Gotta have a plan`,
  `${FILE} .. `,
  "Dubious, test returned 3 (wstat 768, 0x300)",
  "No subtests run ",
  `${FILE} (Wstat: 768 (exited 3) Tests: 0 Failed: 0)`,
  "  Non-zero exit status: 3",
  "  Parse errors: No plan found in TAP output",
  "Result: FAIL",
].join("\n");

describe("findProblems", () => {
  it("passes a clean run", () => {
    expect(findProblems(PASSING, 0)).toEqual([]);
  });

  it("passes a run with Windows line endings", () => {
    expect(findProblems(PASSING.replaceAll("\n", "\r\n"), 0)).toEqual([]);
  });

  it("fails a run the harness passed when pgTAP reports a plan mismatch", () => {
    expect(findProblems(SAVEPOINT_ROLLBACK, 0)).toEqual([
      `plan mismatch in ${FILE}: planned 3 but pgTAP ran 1`,
    ]);
  });

  it("reads the singular form of the diagnostic", () => {
    const output = `${PASSING}\n# Looks like you planned 1 test but ran 0`;
    expect(findProblems(output, 0)).toEqual([
      `plan mismatch in ${FILE}: planned 1 but pgTAP ran 0`,
    ]);
  });

  it("names no file when the diagnostic comes before any file line", () => {
    const output = "# Looks like you planned 4 tests but ran 2\nResult: PASS";
    expect(findProblems(output, 0)).toEqual(["plan mismatch: planned 4 but pgTAP ran 2"]);
  });

  it("attributes each diagnostic to the file it follows", () => {
    const other = "/repo/supabase/tests/database/folders.test.sql";
    const output = [
      `${FILE} .. ok`,
      `${other} .. `,
      "# Looks like you planned 5 tests but ran 4",
      "Result: PASS",
    ].join("\n");
    expect(findProblems(output, 0)).toEqual([
      `plan mismatch in ${other}: planned 5 but pgTAP ran 4`,
    ]);
  });

  it("fails a file that stopped short of its plan", () => {
    const problems = findProblems(STOPPED_SHORT, 1);
    expect(problems).toContain("supabase test db exited with 1");
    expect(problems).toContain(`plan mismatch in ${FILE}: planned 2 but pgTAP ran 1`);
    expect(problems.some((p) => p.includes("Bad plan"))).toBe(true);
    expect(problems.some((p) => p.includes("no `Result: PASS`"))).toBe(true);
  });

  it("fails a file with no plan", () => {
    const problems = findProblems(NO_PLAN, 1);
    expect(problems.some((p) => p.includes("No plan found"))).toBe(true);
  });

  it("reports pgTAP's own failure count", () => {
    const output = `${FILE} .. \n# Looks like you failed 2 tests of 52\nResult: FAIL`;
    expect(findProblems(output, 1)).toContain(`pgTAP counted 2 failed of 52 in ${FILE}`);
  });

  it("fails a non-zero exit even when the output looks clean", () => {
    expect(findProblems(PASSING, 2)).toEqual(["supabase test db exited with 2"]);
  });

  it("fails a run killed by a signal", () => {
    expect(findProblems(PASSING, null)).toEqual(["supabase test db was killed before it finished"]);
  });

  it("fails a zero exit that never printed a passing verdict", () => {
    expect(findProblems("Connecting to local database...\n", 0)).toEqual([
      "no `Result: PASS` line: the harness never reported a passing run",
    ]);
  });

  it("does not take a `Result: PASS` inside another line as the verdict", () => {
    expect(findProblems("# note: Result: PASS expected\n", 0)).toHaveLength(1);
  });

  it("ignores a diagnostic whose counts agree", () => {
    expect(findProblems(`${PASSING}\n# Looks like you planned 3 tests but ran 3`, 0)).toEqual([]);
  });
});
