// Regenerates src/lib/supabase/database.types.ts from the hosted project.
// Output is written only after generation succeeds, so a failed run (not logged in, network,
// rate limit) leaves the committed file untouched instead of truncating it.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PROJECT_ID = "vauokqoyvewtzubqajgh";
const OUT = "src/lib/supabase/database.types.ts";
const shell = process.platform === "win32";

let types;
try {
  types = execFileSync(
    "pnpm",
    [
      "exec",
      "supabase",
      "gen",
      "types",
      "typescript",
      "--project-id",
      PROJECT_ID,
      "--schema",
      "public",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], shell },
  );
} catch {
  console.error(`db:types: generation failed; ${OUT} was not changed.`);
  process.exit(1);
}

if (!types.includes("export type Database")) {
  console.error(`db:types: output did not contain a Database type; ${OUT} was not changed.`);
  process.exit(1);
}

writeFileSync(OUT, types);
execFileSync("pnpm", ["exec", "prettier", "--write", OUT], { stdio: "inherit", shell });
