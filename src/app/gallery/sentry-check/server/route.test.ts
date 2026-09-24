import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { scrubString } from "@/lib/observability/scrub";
import { SENTRY_CHECK_MESSAGE } from "../message";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /gallery/sentry-check/server", () => {
  it("is not found on production, like the rest of the gallery", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(GET()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("throws on purpose everywhere else, so onRequestError has something to report", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(GET()).rejects.toThrow(SENTRY_CHECK_MESSAGE("server"));
  });

  it("carries fake student data, so the owner can see the scrub worked", () => {
    expect(SENTRY_CHECK_MESSAGE("server")).toMatch(/@example\.test/);
    expect(SENTRY_CHECK_MESSAGE("server")).toMatch(/\/c\/[A-Za-z0-9_-]{32}/);
  });

  it("reads in Sentry the way docs/05 §7.9 tells the owner to expect", () => {
    expect(scrubString(SENTRY_CHECK_MESSAGE("server"))).toBe(
      "Sentry check (server): fake student [email] opened /c/[redacted] with code [code]",
    );
  });
});
