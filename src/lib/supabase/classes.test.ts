import { describe, expect, it, vi } from "vitest";
import {
  classRoster,
  createClass,
  listClasses,
  readClass,
  removeStudent,
  renameClass,
  rotateInvite,
  setClassTimeZone,
} from "./classes";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof listClasses>[0];

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const STUDENT = "00000000-0000-4000-8000-0000000000d1";
const TOKEN = "AbC_-0123456789abcdefghijklmnopq";

/** A query builder whose every step returns itself and which resolves to `reply` when awaited. */
function fakeQuery(reply: Reply) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "insert", "update", "delete", "eq", "order", "limit"]) {
    builder[step] = (...args: unknown[]) => {
      calls.push([step, args]);
      return builder;
    };
  }
  builder.single = async () => reply;
  builder.maybeSingle = async () => reply;
  builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Client, from, calls };
}

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

describe("listClasses", () => {
  it("lists the org's classes with a member count, never a token", async () => {
    const fake = fakeQuery({
      data: [{ id: CLASS_ID, name: "NUR 310", class_members: [{ count: 3 }] }],
      error: null,
    });
    expect(await listClasses(fake.client)).toEqual([
      { id: CLASS_ID, name: "NUR 310", memberCount: 3 },
    ]);
    expect(fake.from).toHaveBeenCalledWith("classes");
    const selected = fake.calls.find(([step]) => step === "select")?.[1][0];
    expect(selected).not.toContain("invite_token");
  });

  it("returns null when the list cannot be read", async () => {
    expect(await listClasses(fakeQuery({ data: null, error: { code: "x" } }).client)).toBeNull();
  });
});

describe("readClass", () => {
  it("reads one class with its token and time zone, for the author's page", async () => {
    const fake = fakeQuery({
      data: { id: CLASS_ID, name: "NUR 310", invite_token: TOKEN, time_zone: "America/Denver" },
    });
    expect(await readClass(fake.client, CLASS_ID)).toEqual({
      id: CLASS_ID,
      name: "NUR 310",
      inviteToken: TOKEN,
      timeZone: "America/Denver",
    });
    expect(fake.calls[0]).toEqual(["select", ["id, name, invite_token, time_zone"]]);
  });

  it("returns null for a class the author cannot see", async () => {
    expect(await readClass(fakeQuery({ data: null, error: null }).client, CLASS_ID)).toBeNull();
  });

  it("throws when the class cannot be read, so the error boundary says so", async () => {
    await expect(
      readClass(fakeQuery({ data: null, error: { code: "08006" } }).client, CLASS_ID),
    ).rejects.toThrow();
  });
});

describe("classRoster", () => {
  it("maps the roster", async () => {
    const fake = fakeRpc({
      data: [
        {
          profile_id: STUDENT,
          email: "a@school.edu",
          display_name: null,
          joined_at: "2026-09-23T10:00:00Z",
          signed_in: true,
        },
      ],
      error: null,
    });
    expect(await classRoster(fake.client, CLASS_ID)).toEqual([
      {
        profileId: STUDENT,
        email: "a@school.edu",
        displayName: null,
        joinedAt: "2026-09-23T10:00:00Z",
        signedIn: true,
      },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("class_roster", { target_class: CLASS_ID });
  });

  it("returns null on an error", async () => {
    expect(await classRoster(fakeRpc({ error: { code: "x" } }).client, CLASS_ID)).toBeNull();
  });
});

describe("writes", () => {
  it("creates a class by name and returns its id", async () => {
    const fake = fakeQuery({ data: { id: CLASS_ID }, error: null });
    expect(await createClass(fake.client, "NUR 310")).toEqual({ ok: true, id: CLASS_ID });
    expect(fake.calls[0]).toEqual(["insert", [{ name: "NUR 310" }]]);
  });

  it("reports a failed create", async () => {
    expect(
      await createClass(fakeQuery({ data: null, error: { code: "42501" } }).client, "x"),
    ).toEqual({ ok: false });
  });

  it("renames, and says when no row changed", async () => {
    const renamed = fakeQuery({ data: [{ id: CLASS_ID }], error: null });
    expect(await renameClass(renamed.client, CLASS_ID, "New")).toBe(true);
    expect(renamed.calls[0]).toEqual(["update", [{ name: "New" }]]);
    expect(await renameClass(fakeQuery({ data: [], error: null }).client, CLASS_ID, "New")).toBe(
      false,
    );
  });

  it("sets the time zone, and says when no row changed (#242)", async () => {
    const set = fakeQuery({ data: [{ id: CLASS_ID }], error: null });
    expect(await setClassTimeZone(set.client, CLASS_ID, "America/New_York")).toBe("saved");
    expect(set.from).toHaveBeenCalledWith("classes");
    expect(set.calls[0]).toEqual(["update", [{ time_zone: "America/New_York" }]]);
    expect(set.calls).toContainEqual(["eq", ["id", CLASS_ID]]);
    expect(
      await setClassTimeZone(fakeQuery({ data: [], error: null }).client, CLASS_ID, "UTC"),
    ).toBe("gone");
  });

  it("tells a zone the database refused from any other failure", async () => {
    const refused = fakeQuery({ data: null, error: { code: "23514" } });
    expect(await setClassTimeZone(refused.client, CLASS_ID, "Mars/Olympus")).toBe("invalid");
    const down = fakeQuery({ data: null, error: { code: "08006" } });
    expect(await setClassTimeZone(down.client, CLASS_ID, "UTC")).toBe("failed");
  });

  it("rotates through the database function", async () => {
    const fake = fakeRpc({ data: TOKEN, error: null });
    expect(await rotateInvite(fake.client, CLASS_ID)).toEqual({ ok: true, changed: true });
    expect(fake.rpc).toHaveBeenCalledWith("rotate_class_invite", { target_class: CLASS_ID });
  });

  it("passes on the database's code when a rotation is refused, and never its text", async () => {
    const refused = fakeRpc({ error: { code: "P0002", message: "that class does not exist" } });
    expect(await rotateInvite(refused.client, CLASS_ID)).toEqual({ ok: false, code: "P0002" });
    const bare = fakeRpc({ error: { message: "network" } });
    expect(await rotateInvite(bare.client, CLASS_ID)).toEqual({ ok: false, code: "unknown" });
  });

  it("removes one student from one class", async () => {
    const fake = fakeQuery({ data: [{ profile_id: STUDENT }], error: null });
    expect(await removeStudent(fake.client, CLASS_ID, STUDENT)).toEqual({
      ok: true,
      changed: true,
    });
    expect(fake.from).toHaveBeenCalledWith("class_members");
    expect(fake.calls).toContainEqual(["eq", ["class_id", CLASS_ID]]);
    expect(fake.calls).toContainEqual(["eq", ["profile_id", STUDENT]]);
  });

  it("tells a student already gone from a delete the database refused", async () => {
    const gone = fakeQuery({ data: [], error: null });
    expect(await removeStudent(gone.client, CLASS_ID, STUDENT)).toEqual({
      ok: true,
      changed: false,
    });
    const refused = fakeQuery({ data: null, error: { code: "42501", message: "denied" } });
    expect(await removeStudent(refused.client, CLASS_ID, STUDENT)).toEqual({
      ok: false,
      code: "42501",
    });
  });
});
