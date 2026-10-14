import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

const updateUser = vi.fn(async () => ({ error: null as unknown }));
const signOut = vi.fn(async () => ({ error: null as unknown }));
const viewer = vi.hoisted(() => ({ current: { status: "signed_out" } as Record<string, unknown> }));
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => viewer.current }));

const demo = vi.hoisted(() => ({ current: null as { email: string; password: string } | null }));
vi.mock("@/lib/auth/demoAccount", () => ({ readDemoAccount: () => demo.current }));

import { choosePassword } from "./actions";

function form(password: string): FormData {
  const data = new FormData();
  data.set("password", password);
  return data;
}

function signedIn(email: string) {
  viewer.current = {
    status: "signed_in",
    email,
    role: "student",
    supabase: { auth: { updateUser, signOut } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  viewer.current = { status: "signed_out" };
  demo.current = null;
});

describe("choosePassword", () => {
  it("saves the signed-in person's password and signs out their other sessions", async () => {
    signedIn("nurse@school.edu");
    expect(await choosePassword({ status: "idle" }, form("correct horse"))).toEqual({
      status: "saved",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "correct horse" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("refuses a short password without asking Supabase", async () => {
    signedIn("nurse@school.edu");
    expect(await choosePassword({ status: "idle" }, form("short"))).toMatchObject({
      status: "error",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("sends a visitor to sign in, and changes nothing", async () => {
    await expect(choosePassword({ status: "idle" }, form("correct horse"))).rejects.toThrow(
      "redirect:/sign-in?next=%2Faccount%2Fpassword",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("never changes the shared demo account's password", async () => {
    demo.current = { email: "demo@learn.test", password: "learn-demo-local" };
    signedIn("Demo@learn.test");
    expect(await choosePassword({ status: "idle" }, form("correct horse"))).toMatchObject({
      status: "error",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });
});
