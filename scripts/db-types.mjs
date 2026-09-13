// Regenerates src/lib/supabase/database.types.ts from the local stack, which has every migration
// applied (`pnpm exec supabase start` or `supabase db reset` first). CI generates the same way
// and fails on any difference, so committed types always match supabase/migrations.
// Output is written only after generation succeeds, so a failed run leaves the file untouched.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "src/lib/supabase/database.types.ts";
const shell = process.platform === "win32";

let types;
try {
  types = execFileSync(
    "pnpm",
    ["exec", "supabase", "gen", "types", "typescript", "--local", "--schema", "public"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], shell },
  );
} catch {
  console.error(
    `db:types: generation failed (is the local stack running?); ${OUT} was not changed.`,
  );
  process.exit(1);
}

if (!types.includes("export type Database")) {
  console.error(`db:types: output did not contain a Database type; ${OUT} was not changed.`);
  process.exit(1);
}

writeFileSync(OUT, types);
execFileSync("pnpm", ["exec", "prettier", "--write", OUT], { stdio: "inherit", shell });
