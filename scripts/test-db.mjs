// #163: `supabase test db`, but a pgTAP plan mismatch fails the run.
//
//     pnpm test:db                                   # every file in supabase/tests
//     pnpm test:db supabase/tests/database/x.test.sql # arguments go straight to supabase test db
//
// The output is passed through as it arrives. Afterwards the whole of it is checked by
// scripts/pgtap-verdict.mjs, which fails the run on a non-zero exit, on no `Result: PASS`, on a
// harness parse error, and on pgTAP's `# Looks like you planned N tests but ran M`, which the
// harness treats as a comment and passes (see that file for why).
import { spawn } from "node:child_process";
import { findProblems } from "./pgtap-verdict.mjs";

const child = spawn("pnpm", ["exec", "supabase", "test", "db", ...process.argv.slice(2)], {
  stdio: ["ignore", "pipe", "pipe"],
  // pnpm is a .cmd shim on Windows, which Node only starts through a shell.
  shell: process.platform === "win32",
});

const chunks = [];
child.stdout.on("data", (chunk) => {
  chunks.push(chunk);
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  chunks.push(chunk);
  process.stderr.write(chunk);
});

child.on("error", (error) => {
  console.error(`test:db: could not start supabase test db: ${error.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  const problems = findProblems(Buffer.concat(chunks).toString("utf8"), code);
  if (problems.length === 0) {
    console.log("test:db: pass (exit 0, Result: PASS, every plan met)");
    return;
  }
  console.error("\ntest:db: FAIL");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
});
