import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Removing a student and replacing the invite link, as a confirmed action reports them (#256).
 * The Supabase client is faked, not the data layer, so what is pinned runs from the database's
 * reply to the sentence the author sees: a refusal is `ok: false` in plain words, a delete that
 * matched nothing is success, and neither the database's text nor an email reaches the log.
 */

const revalidated = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated(path) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
let reply: Reply;

/** A query builder whose every step returns itself and which resolves to `reply` when awaited. */
const builder: Record<string, unknown> = {};
for (const step of ["select", "delete", "eq"]) builder[step] = () => builder;
builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
const client = { from: vi.fn(() => builder), rpc: vi.fn(async () => reply) };

const requireAuthor = vi.fn<(next: string) => Promise<{ supabase: typeof client }>>(async () => ({
  supabase: client,
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: (next: string) => requireAuthor(next),
}));

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

const { removeStudent, rotateInvite } = await import("./actions");

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const STUDENT = "00000000-0000-4000-8000-0000000000d1";
const EMAIL = "student@example.test";
/** What Postgres might say, quoting the row. It must stay on the server and out of the log. */
const LEAKY = { code: "42501", message: `permission denied for ${EMAIL}` };

beforeEach(() => {
  revalidated.mockClear();
  requireAuthor.mockClear();
  client.from.mockClear();
  client.rpc.mockClear();
  logged.mockClear();
});

function logText(): string {
  return JSON.stringify(logged.mock.calls);
}

describe("removeStudent", () => {
  it("is ok and refreshes the class when the student went", async () => {
    reply = { data: [{ profile_id: STUDENT }], error: null };
    expect(await removeStudent(CLASS_ID, STUDENT)).toEqual({ ok: true });
    expect(requireAuthor).toHaveBeenCalledWith(`/author/classes/${CLASS_ID}`);
    expect(client.from).toHaveBeenCalledWith("class_members");
    expect(revalidated).toHaveBeenCalledWith(`/author/classes/${CLASS_ID}`);
  });

  it("treats a student someone else already removed as done, and refreshes", async () => {
    reply = { data: [], error: null };
    expect(await removeStudent(CLASS_ID, STUDENT)).toEqual({ ok: true });
    expect(revalidated).toHaveBeenCalledWith(`/author/classes/${CLASS_ID}`);
    expect(logged).not.toHaveBeenCalled();
  });

  it("says so plainly when the database refuses, and logs only the code", async () => {
    reply = { data: null, error: LEAKY };
    expect(await removeStudent(CLASS_ID, STUDENT)).toEqual({
      ok: false,
      message: "Could not remove this student. Try again.",
    });
    expect(revalidated).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logText()).toContain("42501");
    expect(logText()).not.toContain(EMAIL);
    expect(logText()).not.toContain("permission denied");
  });

  it("refuses ids that are not ids before asking the database", async () => {
    expect(await removeStudent(CLASS_ID, "../x")).toEqual({
      ok: false,
      message: "Could not remove this student. Try again.",
    });
    expect(await removeStudent("nope", STUDENT)).toMatchObject({ ok: false });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("rotateInvite", () => {
  it("is ok and refreshes the class when the token changed", async () => {
    reply = { data: "AbC_-0123456789abcdefghijklmnopq", error: null };
    expect(await rotateInvite(CLASS_ID)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("rotate_class_invite", { target_class: CLASS_ID });
    expect(revalidated).toHaveBeenCalledWith(`/author/classes/${CLASS_ID}`);
  });

  it("says the class is gone when the database cannot find it", async () => {
    reply = { data: null, error: { code: "P0002", message: "that class does not exist" } };
    expect(await rotateInvite(CLASS_ID)).toEqual({
      ok: false,
      message: "That class no longer exists.",
    });
    expect(revalidated).not.toHaveBeenCalled();
  });

  it("says so plainly on any other refusal, and logs only the code", async () => {
    reply = { data: null, error: LEAKY };
    expect(await rotateInvite(CLASS_ID)).toEqual({
      ok: false,
      message: "Could not replace the link. Try again.",
    });
    expect(logText()).toContain("42501");
    expect(logText()).not.toContain(EMAIL);
  });

  it("refuses an id that is not one before asking the database", async () => {
    expect(await rotateInvite("nope")).toEqual({
      ok: false,
      message: "That class no longer exists.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
