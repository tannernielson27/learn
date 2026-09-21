// #163: decides whether a `supabase test db` run passed, from its exit code and its output.
//
// `supabase test db` runs the files through pg_prove, whose harness only counts the TAP lines it
// sees. That catches a file that errors, stops early or never plans. It misses one shape: a
// `rollback to savepoint` inside a test file also rolls back pgTAP's own count of tests run, so
// every `ok` line is printed and the harness is satisfied while pgTAP's `finish()` reports
// `# Looks like you planned 12 tests but ran 6` as a comment. The harness ignores comments and
// prints `Result: PASS`. That diagnostic means pgTAP's state no longer matches the file, so it
// fails the run here.
//
// Kept free of I/O so it can be unit-tested; scripts/test-db.mjs does the running.

/** pgTAP's `finish()` diagnostic, e.g. `# Looks like you planned 12 tests but ran 6`. */
const PLAN_MISMATCH = /Looks like you planned (\d+) tests? but ran (\d+)/;

/** pgTAP's `finish()` diagnostic for failures it counted. The harness also sees `not ok`. */
const FAILED_COUNT = /Looks like you failed (\d+) tests? of (\d+)/;

/** What TAP::Harness (pg_prove) prints when the TAP stream itself is wrong. */
const HARNESS_MARKERS = ["Bad plan", "No plan found", "Parse errors"];

/** pg_prove's per-file progress line: `/path/to/file.test.sql ....... ok`. */
const FILE_LINE = /^(\S+\.sql) \.+/;

/** The only verdict line that counts as a pass. */
const RESULT_PASS = /^Result: PASS\s*$/m;

/**
 * @param {string} output everything the run wrote, stdout and stderr together
 * @param {number | null} exitCode the run's exit code; null when it was killed by a signal
 * @returns {string[]} one reason per problem; empty when the run passed
 */
export function findProblems(output, exitCode) {
  const problems = [];

  if (exitCode !== 0) {
    problems.push(
      exitCode === null
        ? "supabase test db was killed before it finished"
        : `supabase test db exited with ${exitCode}`,
    );
  }

  let file = null;
  for (const line of output.split(/\r?\n/)) {
    const fileMatch = FILE_LINE.exec(line);
    if (fileMatch) file = fileMatch[1];

    const where = file ? ` in ${file}` : "";
    const mismatch = PLAN_MISMATCH.exec(line);
    if (mismatch && mismatch[1] !== mismatch[2]) {
      problems.push(`plan mismatch${where}: planned ${mismatch[1]} but pgTAP ran ${mismatch[2]}`);
    }
    const failed = FAILED_COUNT.exec(line);
    if (failed) {
      problems.push(`pgTAP counted ${failed[1]} failed of ${failed[2]}${where}`);
    }
    const marker = HARNESS_MARKERS.find((m) => line.includes(m));
    if (marker) {
      problems.push(`harness reported "${line.trim()}"${where}`);
    }
  }

  if (!RESULT_PASS.test(output)) {
    problems.push("no `Result: PASS` line: the harness never reported a passing run");
  }

  return problems;
}
