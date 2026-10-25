import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The student progress page turns a malformed class or student id away as not-found before the
 * author check, so a bad address costs no auth round trip. A well-formed id still goes through
 * `requireAuthor` first, and nothing is read for a malformed one.
 */

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

const requireAuthor = vi.fn<(next: string) => Promise<{ supabase: object }>>(async () => ({
  supabase: {},
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: (next: string) => requireAuthor(next),
}));

const readClass = vi.fn<(client: unknown, id: string) => Promise<null>>(async () => null);
vi.mock("@/lib/supabase/classes", () => ({
  readClass: (client: unknown, id: string) => readClass(client, id),
}));
const readClassProgress = vi.fn();
vi.mock("@/lib/supabase/classProgress", () => ({ readClassProgress }));

const { default: ClassStudentPage } = await import("./page");

const CLASS = "00000000-0000-4000-8000-0000000004c1";
const STUDENT = "00000000-0000-4000-8000-0000000004a1";

function visit(classId: string, profileId: string) {
  return ClassStudentPage({ params: Promise.resolve({ classId, profileId }) } as Parameters<
    typeof ClassStudentPage
  >[0]);
}

describe("ClassStudentPage", () => {
  beforeEach(() => {
    requireAuthor.mockClear();
    readClass.mockClear();
    readClassProgress.mockClear();
  });

  it.each([
    ["class", "not-a-uuid", STUDENT],
    ["student", CLASS, "not-a-uuid"],
  ])(
    "answers a malformed %s id with not-found before the author check",
    async (_, classId, profileId) => {
      await expect(visit(classId, profileId)).rejects.toThrow("notFound");
      expect(requireAuthor).not.toHaveBeenCalled();
      expect(readClass).not.toHaveBeenCalled();
      expect(readClassProgress).not.toHaveBeenCalled();
    },
  );

  it("checks the author for well-formed ids, then reads the class", async () => {
    await expect(visit(CLASS, STUDENT)).rejects.toThrow("notFound");
    expect(requireAuthor).toHaveBeenCalledOnce();
    expect(readClass).toHaveBeenCalledWith({}, CLASS);
    expect(readClassProgress).not.toHaveBeenCalled();
  });
});
