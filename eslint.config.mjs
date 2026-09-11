import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // src/lib/ngn is the framework-free scoring core (ADR 0001): no React, Next, Supabase or UI code.
  {
    files: ["src/lib/ngn/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react/*", "react-dom", "react-dom/*"],
              message: "src/lib/ngn is pure TypeScript (ADR 0001): no React.",
            },
            {
              group: ["next", "next/*"],
              message: "src/lib/ngn is pure TypeScript (ADR 0001): no Next.js.",
            },
            {
              group: ["@supabase/*"],
              message: "src/lib/ngn is pure TypeScript (ADR 0001): no Supabase.",
            },
            {
              group: ["@/components/*", "@/app/*", "**/components/**", "**/app/**"],
              message: "src/lib/ngn must not import UI code (ADR 0001).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
