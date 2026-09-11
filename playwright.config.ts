import { defineConfig, devices } from "@playwright/test";

/**
 * Gallery screenshots and axe checks (issue #8).
 * CI sets PLAYWRIGHT_BASE_URL to the Vercel preview; locally Playwright builds and starts the
 * app on port 3100, since Next recommends testing production output rather than `next dev`.
 */
const remote = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = remote ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // More parallel headless browsers than this makes full-page captures fail intermittently
  // ("Unable to capture screenshot") on a busy machine; 2 matches the CI runner's default.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phone-375",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: remote
    ? undefined
    : {
        command: "pnpm build && pnpm start --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
