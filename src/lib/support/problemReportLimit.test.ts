import { describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_BUCKETS } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { PROBLEM_REPORT_LIMITS, createProblemReportLimiter } from "./problemReportLimit";

describe("the problem report limiter", () => {
  it("names buckets the database accepts", () => {
    for (const bucket of ["problem_report", "problem_report_total"] as const) {
      expect(RATE_LIMIT_BUCKETS).toContain(bucket);
      expect(bucket).toMatch(/^[a-z][a-z0-9_]{0,47}$/);
    }
  });

  it("lets one account send five an hour, then refuses that account only", async () => {
    const limiter = createProblemReportLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < PROBLEM_REPORT_LIMITS.account.attempts; i += 1) {
      expect(await limiter.take("user-a")).toBe("ok");
    }
    expect(await limiter.take("user-a")).toBe("rate_limited");
    expect(await limiter.take("user-b")).toBe("ok");
  });

  it("counts the account before the deployment, so a refused account spends no ceiling", async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createProblemReportLimiter(store, {
      account: { attempts: 1, windowMs: 60_000 },
      total: { attempts: 100, windowMs: 60_000 },
    });
    await limiter.take("user-a");
    await limiter.take("user-a");
    expect(store.hits()).toEqual([
      { bucket: "problem_report", key: "user-a" },
      { bucket: "problem_report_total", key: "deployment" },
      { bucket: "problem_report", key: "user-a" },
    ]);
  });

  it("refuses everyone once the deployment's ceiling is reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limiter = createProblemReportLimiter(createMemoryRateLimitStore(), {
      account: { attempts: 5, windowMs: 60_000 },
      total: { attempts: 2, windowMs: 60_000 },
    });
    expect(await limiter.take("a")).toBe("ok");
    expect(await limiter.take("b")).toBe("ok");
    expect(await limiter.take("c")).toBe("rate_limited");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("fails closed, logging only the error's name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = createMemoryRateLimitStore();
    store.failWith(new Error("connection to user-a refused"));
    expect(await createProblemReportLimiter(store).take("user-a")).toBe("unavailable");
    expect(JSON.stringify(error.mock.calls)).not.toContain("user-a");
    error.mockRestore();
  });
});
