import { afterEach, describe, expect, it, vi } from "vitest";

const createSupabaseServiceClient = vi.fn(() => "service-client");
const autoSubmitExpired = vi.fn(async () => 3);
const createReminderStore = vi.fn(() => "store");

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => createSupabaseServiceClient(),
}));
vi.mock("@/lib/assignments/attemptStore", () => ({
  autoSubmitStore: (client: unknown) => ({ client }),
}));
vi.mock("@/lib/assignments/submitAttempt", () => ({
  autoSubmitExpired: (...args: unknown[]) => autoSubmitExpired(...(args as [])),
}));
vi.mock("@/lib/supabase/reminders", () => ({
  createReminderStore: (...args: unknown[]) => createReminderStore(...(args as [])),
}));

const { CRON_AUTO_SUBMIT_BATCH, reminderCronDeps } = await import("./cronDeps");

afterEach(() => {
  vi.unstubAllEnvs();
  createSupabaseServiceClient.mockClear();
});

describe("reminderCronDeps", () => {
  it("reads CRON_SECRET and builds nothing until asked", () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(40));
    const deps = reminderCronDeps();
    expect(deps.secret).toBe("x".repeat(40));
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("counts its limits in the shared store (#234)", () => {
    expect(reminderCronDeps().limiter).toBeDefined();
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("shares one service client between the store and the submit at close", async () => {
    const deps = reminderCronDeps();
    expect(deps.store()).toBe("store");
    expect(await deps.autoSubmit()).toBe(3);
    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1);
    expect(createReminderStore).toHaveBeenCalledWith("service-client");
    expect(autoSubmitExpired).toHaveBeenCalledWith(
      { client: "service-client" },
      { limit: CRON_AUTO_SUBMIT_BATCH },
    );
  });

  it("links to the deployment's own origin on Vercel, not the caller's Host", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "learn.example");
    const deps = reminderCronDeps();
    expect(deps.origin(new Headers({ host: "evil.example" }))).toBe("https://learn.example");
  });
});
