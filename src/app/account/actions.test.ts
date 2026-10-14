import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_NAME_EMPTY, ACCOUNT_NAME_TOO_LONG } from "@/lib/auth/displayName";

const redirect = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));

// The signed-in person's own cookie client: RLS ("users rename themselves") and the column grant
// (`update (display_name)`) are what stop a write to anyone else's row. The action adds its own
// filter on the session's user id and never reads an id from the form.
type Reply = { data: { id: string }[] | null; error: { code?: string; status?: number } | null };
const reply = vi.hoisted(() => ({ current: null as unknown as Reply }));
const select = vi.fn<(columns: string) => Promise<Reply>>(async () => reply.current);
const eq = vi.fn<(column: string, value: string) => { select: typeof select }>(() => ({ select }));
const update = vi.fn<(values: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }));
const from = vi.fn<(table: string) => { update: typeof update }>(() => ({ update }));

const viewer = vi.hoisted(() => ({ current: { status: "signed_out" } as Record<string, unknown> }));
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => viewer.current }));

const demo = vi.hoisted(() => ({ current: null as { email: string; password: string } | null }));
vi.mock("@/lib/auth/demoAccount", () => ({ readDemoAccount: () => demo.current }));

import { saveDisplayName } from "./actions";

const ME = "00000000-0000-4000-8000-0000000000a1";
const SOMEONE_ELSE = "00000000-0000-4000-8000-0000000000b2";
const idle = { status: "idle" } as const;

function form(displayName: string, extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("displayName", displayName);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

function signedIn(email = "nurse@school.edu") {
  viewer.current = {
    status: "signed_in",
    userId: ME,
    email,
    role: "student",
    displayName: null,
    supabase: { from },
  };
}

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  viewer.current = { status: "signed_out" };
  demo.current = null;
  reply.current = { data: [{ id: ME }], error: null };
});

describe("saveDisplayName", () => {
  it("saves the cleaned name on the signed-in person's own row, and refreshes the page", async () => {
    signedIn();
    expect(await saveDisplayName(idle, form("  Ana   Reyes "))).toEqual({
      status: "saved",
      name: "Ana Reyes",
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ display_name: "Ana Reyes" });
    expect(eq).toHaveBeenCalledWith("id", ME);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("changes only the caller's own name, whatever id the form carries", async () => {
    signedIn();
    await saveDisplayName(idle, form("Ana", { id: SOMEONE_ELSE, userId: SOMEONE_ELSE }));
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", ME);
    expect(JSON.stringify(update.mock.calls)).not.toContain(SOMEONE_ELSE);
  });

  it("sends a signed-out call to sign in, and writes nothing", async () => {
    await expect(saveDisplayName(idle, form("Ana"))).rejects.toThrow(
      "redirect:/sign-in?next=%2Faccount",
    );
    expect(from).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses an empty or over-long name without asking the database", async () => {
    signedIn();
    expect(await saveDisplayName(idle, form("   "))).toEqual({
      status: "error",
      error: ACCOUNT_NAME_EMPTY,
    });
    expect(await saveDisplayName(idle, new FormData())).toEqual({
      status: "error",
      error: ACCOUNT_NAME_EMPTY,
    });
    expect(await saveDisplayName(idle, form("x".repeat(81)))).toEqual({
      status: "error",
      error: ACCOUNT_NAME_TOO_LONG,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("never renames the shared demo account", async () => {
    demo.current = { email: "demo@learn.test", password: "learn-demo-local" };
    signedIn("Demo@learn.test");
    expect(await saveDisplayName(idle, form("Ana"))).toMatchObject({ status: "error" });
    expect(from).not.toHaveBeenCalled();
  });

  it("says so when the database refuses or no row was changed, and logs no name", async () => {
    signedIn();
    reply.current = { data: null, error: { code: "42501", status: 403 } };
    expect(await saveDisplayName(idle, form("Ana Reyes"))).toMatchObject({ status: "error" });
    // RLS hides a row it will not let you change: an update that touched nothing is a refusal.
    reply.current = { data: [], error: null };
    expect(await saveDisplayName(idle, form("Ana Reyes"))).toMatchObject({ status: "error" });
    expect(refresh).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Ana Reyes");
  });
});
