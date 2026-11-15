// #565: loads supabase/seed-demo-sessions.sql into the LOCAL database, so the demo teacher
// (demo@learn.test) has a crowded sessions list and reports with real numbers in them.
//
//     pnpm seed:demo-sessions
//
// Needs the local stack running (`pnpm exec supabase start`). The SQL turns triggers off for its
// own transaction, which only a superuser may do, so it goes in through `docker exec` as the
// container's `supabase_admin` rather than over the network. The container is named after
// `project_id` in supabase/config.toml, which is how the Supabase CLI names it. Local only: there
// is no way to point this at a hosted project.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) {
  console.error("seed:demo-sessions: no project_id in supabase/config.toml");
  process.exit(1);
}
const container = `supabase_db_${projectId}`;
const sql = readFileSync(fileURLToPath(new URL("supabase/seed-demo-sessions.sql", root)));

const child = spawn(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
child.on("error", (error) => {
  console.error(`seed:demo-sessions: could not start docker: ${error.message}`);
  console.error(
    "Is Docker Desktop running, and the local stack started (pnpm exec supabase start)?",
  );
  process.exit(1);
});
child.on("close", (code) => {
  if (code !== 0) {
    console.error(`seed:demo-sessions: failed (exit ${code}). Is ${container} running?`);
    process.exit(code ?? 1);
  }
  console.log("seed:demo-sessions: done. Sign in as demo@learn.test and open Live sessions.");
});
child.stdin.end(sql);
