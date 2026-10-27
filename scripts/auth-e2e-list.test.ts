// Every Playwright spec that needs the local Supabase stack runs in CI's `auth e2e` job. Such a
// spec skips itself unless E2E_AUTH=1, and the preview e2e job never sets it, so a spec missing
// from the job's file list never runs anywhere and its failures are never seen. This reads the
// workflow as text, as db-backup-workflow.test.ts does, and fails on any spec left out.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");

/** The specs the `auth e2e` step names: the `pnpm e2e` line run with E2E_AUTH set. */
const listed = new Set(
  workflow
    .split(/\r?\n/)
    .filter((line) => /^\s*run: pnpm e2e /.test(line))
    .flatMap((line) => line.match(/e2e\/[\w.-]+\.spec\.ts/g) ?? []),
);

const needsStack = readdirSync(path.join(ROOT, "e2e"))
  .filter((file) => file.endsWith(".spec.ts"))
  .filter((file) =>
    /process\.env\.E2E_AUTH !== "1"/.test(readFileSync(path.join(ROOT, "e2e", file), "utf8")),
  )
  .map((file) => `e2e/${file}`)
  .sort();

describe("the auth e2e job's spec list", () => {
  it("is read from the workflow", () => {
    expect(listed.size).toBeGreaterThan(10);
    expect(needsStack.length).toBeGreaterThan(10);
  });

  it("names every spec that skips without the local stack", () => {
    expect(needsStack.filter((spec) => !listed.has(spec))).toEqual([]);
  });
});
