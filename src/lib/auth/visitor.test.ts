import { beforeEach, describe, expect, it, vi } from "vitest";

const readViewer = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());
vi.mock("@/lib/classes/viewer", () => ({ readViewer }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { readLandingEntry, readVisitor } from "./visitor";

describe("readVisitor (#264, #522)", () => {
  beforeEach(() => {
    readViewer.mockReset();
    captureException.mockReset();
  });

  it("passes a signed-out visitor through", async () => {
    readViewer.mockResolvedValue({ status: "signed_out" });
    await expect(readVisitor()).resolves.toEqual({ status: "signed_out" });
  });

  it("keeps only the role of someone signed in", async () => {
    readViewer.mockResolvedValue({
      status: "signed_in",
      role: "instructor",
      email: "ada@school.edu",
      displayName: "Ada",
    });
    await expect(readVisitor()).resolves.toEqual({ status: "signed_in", role: "instructor" });
  });

  it("reads a failure as signed out, and reports it", async () => {
    const failure = new Error("auth outage");
    readViewer.mockRejectedValue(failure);
    await expect(readVisitor()).resolves.toEqual({ status: "signed_out" });
    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("names the first link: an account for a visitor, the library for a teacher", async () => {
    readViewer.mockResolvedValue({ status: "signed_out" });
    expect((await readLandingEntry()).href).toBe("/sign-up");
    readViewer.mockResolvedValue({ status: "signed_in", role: "admin" });
    expect(await readLandingEntry()).toEqual({ href: "/author", label: "Go to your quizzes" });
  });
});
