import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "core",
          environment: "node",
          // src/app holds the Server Functions. Only their wiring is tested here — the work
          // itself lives in src/lib — so they stay out of the coverage numbers below.
          include: ["src/lib/**/*.{test,spec}.ts", "src/app/**/*.{test,spec}.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          globals: true,
          // Each file gets its own worker, and jsdom's start-up bleeds into the first render when
          // enough of them come up at once under coverage. The tests themselves run in well under
          // a second; the default 5s is measuring machine contention, not the component.
          testTimeout: 15_000,
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "src/components/**/*.{test,spec}.{ts,tsx}",
            "src/features/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/app/**",
        "src/**/*.d.ts",
        "src/lib/ngn/fixtures/**",
        "src/lib/supabase/database.types.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        "src/lib/ngn/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
