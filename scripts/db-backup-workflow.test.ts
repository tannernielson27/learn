// #236: guard rails on the nightly backup workflow. The repo is public, so a workflow that holds
// PROD_DB_URL must never run for a pull request (a fork's PR could otherwise read the secret or
// the dump), never hold a write token, and never run an action whose code can change under a tag.
// There is no YAML parser in the dependencies, so this reads the file as text: the workflow is
// small and written to be read this way, and each check fails closed on a shape it does not know.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = path.resolve(import.meta.dirname, "../.github/workflows/db-backup.yml");
const SCRIPT = path.resolve(import.meta.dirname, "db-backup.sh");

const source = readFileSync(WORKFLOW, "utf8");
// Comments may say anything; only the YAML itself is checked.
const lines = source.split(/\r?\n/).map((line) => line.replace(/(^|\s)#.*$/, "").trimEnd());

/** The lines of a top-level key's block: from `key:` up to the next top-level key. */
function topLevelBlock(key: string): string[] {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))];
}

/** The keys directly under a top-level block (the first indent level found in it). */
function childKeys(block: string[]): string[] {
  const children = block.slice(1).filter((line) => line.trim() !== "");
  const indent = Math.min(...children.map((line) => line.search(/\S/)));
  return children
    .filter((line) => line.search(/\S/) === indent)
    .map((line) => line.trim().replace(/:.*$/, ""));
}

describe("the nightly backup workflow (#236)", () => {
  it("runs only on a schedule or by hand", () => {
    const on = topLevelBlock("on");
    expect(on[0]).toBe("on:");
    expect(childKeys(on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(source).not.toMatch(/pull_request|workflow_run|repository_dispatch|\bpush:/);
  });

  it("asks for read-only contents and nothing else", () => {
    const permissions = topLevelBlock("permissions");
    expect(permissions.slice(1).filter((line) => line.trim() !== "")).toEqual(["  contents: read"]);
    // No job widens it.
    expect(lines.filter((line) => /^\s+permissions:/.test(line))).toEqual([]);
    expect(source).not.toMatch(/:\s*write\b|write-all/);
  });

  it("never overlaps a running backup", () => {
    const concurrency = topLevelBlock("concurrency");
    expect(concurrency.join("\n")).toMatch(/group:\s*\S+/);
  });

  it("pins every action to a full commit SHA", () => {
    const uses = lines.filter((line) => /^\s*(-\s+)?uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
    }
  });

  it("keeps the artifact 14 days and uploads only ciphertext", () => {
    expect(source).toMatch(/retention-days:\s*14\b/);
    const paths = lines.filter((line) => /^\s+path:/.test(line));
    expect(paths.length).toBeGreaterThan(0);
    for (const line of paths) expect(line).toMatch(/\*\.age$/);
    expect(source).toMatch(/if-no-files-found:\s*error/);
  });

  it("uses no cache, so nothing from the run can outlive it there", () => {
    expect(source).not.toMatch(/actions\/cache|cache:/);
  });

  it("hands the secrets to steps that run the script, never to the whole job or an action", () => {
    const secretLines = lines.filter((line) => /\$\{\{\s*secrets\./.test(line));
    expect(secretLines.length).toBeGreaterThan(0);
    // Step-level `env:` sits at ten spaces; job-level at six, which every action would inherit.
    for (const line of secretLines) expect(line.search(/\S/)).toBe(10);
  });

  it("masks the database URL and skips cleanly when a secret is missing", () => {
    expect(source).toMatch(/::add-mask::/);
    expect(source).toMatch(/::notice\b/);
    expect(source).not.toMatch(/set -x|echo\s+"?\$\{?PROD_DB_URL/);
  });
});

describe("the backup script (#236)", () => {
  const script = readFileSync(SCRIPT, "utf8");

  it("stops on the first error, including inside a pipe", () => {
    expect(script).toMatch(/^set -euo pipefail$/m);
    expect(script).not.toMatch(/set -x/);
  });

  it("pipes every dump straight into age, so no plaintext file is written", () => {
    const code = script.split(/\r?\n/).filter((line) => !line.trim().startsWith("#"));
    const dumps = code.filter((line) => /(db dump|pg_dump|psql)\b/.test(line));
    expect(dumps.length).toBe(5);
    for (const line of dumps) {
      // Straight into age, or (the history) into a pipe inside history(), which goes into age.
      expect(line).toMatch(/\|\s*(sed .*\|\s*)?encrypt \w+$|\\$/);
      // psql's one `-f` reads the committed query; no other file flag, and no redirect, may appear.
      const writes = line.replace(/ -f "\$here\/db-backup-platform\.sql"/, "");
      expect(writes).not.toMatch(/(^|\s)(-f|--file|-o|--output)(\s|=)|>/);
    }
    expect(code).toContain("history | encrypt history");
    // Five parts, each written by age and by nothing else.
    expect(code.filter((line) => /\|\s*encrypt \w+$/.test(line))).toHaveLength(5);
    expect(code.filter((line) => />/.test(line) && !/>&2/.test(line))).toEqual([]);
  });

  it("refuses an age secret key in place of the recipient", () => {
    expect(script).toMatch(/AGE-SECRET-KEY/);
  });
});

describe("the documented restore (#236)", () => {
  const docs = readFileSync(
    path.resolve(import.meta.dirname, "../docs/05-VERSION-CONTROL-AND-DEPLOY.md"),
    "utf8",
  );

  it("resets the new project's default grants before the schema, and loads every part in order", () => {
    const order = [
      "--file plain/roles.sql",
      "--file scripts/db-restore-prepare.sql",
      "--file plain/schema.sql",
      "SET session_replication_role = replica",
      "--file plain/data.sql",
      "--file plain/history.sql",
      "--file plain/platform.sql",
    ].map((needle) => docs.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
