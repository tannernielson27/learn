import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

/**
 * `pnpm eval:ai-import` (#339): the live eval, by hand only. The repo's own vitest config never
 * includes `*.eval.ts`, so `pnpm test` and CI cannot reach the API. Only the API key is read from
 * .env.local, and only into this run.
 */
const root = path.resolve(import.meta.dirname, "../..");
const envFile = path.join(root, ".env.local");
const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const apiKey = process.env.ANTHROPIC_API_KEY ?? fromFile.ANTHROPIC_API_KEY;

export default defineConfig({
  resolve: { alias: { "@": path.join(root, "src") } },
  test: {
    root,
    name: "ai-import-eval",
    environment: "node",
    include: ["test/ai-import/live.eval.ts"],
    // A document is a few calls of up to a minute each; the whole corpus takes some minutes.
    testTimeout: 60 * 60_000,
    env: { AI_IMPORT_EVAL: "1", ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) },
  },
});
