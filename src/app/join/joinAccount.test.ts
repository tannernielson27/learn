import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/classes/viewer";

/**
 * What the join page knows about who is joining (ADR 0013). Signed out is today's page with no
 * lookup at all; the class is asked for only for a signed-in student, with the id the server
 * verified, and only when the address carried a code.
 */

const readViewer = vi.fn<() => Promise<Viewer>>();
vi.mock("@/lib/classes/viewer", () => ({ readViewer: () => readViewer() }));

const SERVICE_CLIENT = { marker: "service" };
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => SERVICE_CLIENT }));

const readMemberClass = vi.fn<(...args: unknown[]) => Promise<string | null>>();
vi.mock("@/lib/supabase/sessions", () => ({
  readMemberClass: (...args: unknown[]) => readMemberClass(...args),
}));

const { readJoinAccount } = await import("./joinAccount");

const STUDENT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

function signedIn(role: "student" | "instructor" | null, displayName: string | null): Viewer {
  return {
    status: "signed_in",
    supabase: {} as never,
    userId: STUDENT,
    email: "mia@example.test",
    role,
    displayName,
  };
}

beforeEach(() => {
  readViewer.mockReset();
  readMemberClass.mockReset();
});

describe("readJoinAccount", () => {
  it("is nothing, and asks nothing, for someone signed out", async () => {
    readViewer.mockResolvedValue({ status: "signed_out" });
    expect(await readJoinAccount("7KQ2MZ", false)).toEqual({ kind: "none" });
    expect(await readJoinAccount("7KQ2MZ", true)).toEqual({ kind: "none" });
    expect(readMemberClass).not.toHaveBeenCalled();
  });

  it("is nothing for a teacher or an account with no role", async () => {
    for (const role of ["instructor", null] as const) {
      readViewer.mockResolvedValue(signedIn(role, "Ada"));
      expect(await readJoinAccount("7KQ2MZ", false)).toEqual({ kind: "none" });
    }
    expect(readMemberClass).not.toHaveBeenCalled();
  });

  it("names the class for a member of the code's session's class, as the verified account", async () => {
    readViewer.mockResolvedValue(signedIn("student", "Mia Chen"));
    readMemberClass.mockResolvedValue("NUR 310");
    expect(await readJoinAccount("7KQ2MZ", false)).toEqual({
      kind: "member",
      name: "Mia Chen",
      className: "NUR 310",
      guestHref: "/join/7KQ2MZ?guest=1",
    });
    expect(readMemberClass).toHaveBeenCalledWith(SERVICE_CLIENT, "7KQ2MZ", STUDENT);
  });

  it("cuts a long account name to what a display name may be", async () => {
    readViewer.mockResolvedValue(signedIn("student", "M".repeat(40)));
    readMemberClass.mockResolvedValue("NUR 310");
    const account = await readJoinAccount("7KQ2MZ", false);
    expect(account.kind === "member" && account.name).toBe("M".repeat(32));
  });

  it("is a plain signed-in note when the code is not a session of the student's class", async () => {
    readViewer.mockResolvedValue(signedIn("student", "Mia Chen"));
    readMemberClass.mockResolvedValue(null);
    expect(await readJoinAccount("7KQ2MZ", false)).toEqual({
      kind: "student",
      name: "Mia Chen",
      guestHref: "/join/7KQ2MZ?guest=1",
    });
  });

  it("asks nothing when the address carried no code", async () => {
    readViewer.mockResolvedValue(signedIn("student", "Mia Chen"));
    expect(await readJoinAccount("", false)).toEqual({
      kind: "student",
      name: "Mia Chen",
      guestHref: "/join?guest=1",
    });
    expect(readMemberClass).not.toHaveBeenCalled();
  });

  it("is a guest, with the way back, when a signed-in student chose to be one", async () => {
    readViewer.mockResolvedValue(signedIn("student", "Mia Chen"));
    expect(await readJoinAccount("7KQ2MZ", true)).toEqual({
      kind: "guest",
      signedInHref: "/join/7KQ2MZ",
    });
    expect(readMemberClass).not.toHaveBeenCalled();
  });
});
