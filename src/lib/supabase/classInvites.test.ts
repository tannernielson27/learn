import { describe, expect, it, vi } from "vitest";
import { joinClass, myClasses, resolveClassInvite } from "./classInvites";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof resolveClassInvite>[0];

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";

describe("resolveClassInvite", () => {
  it("resolves a token to the class id and name, passing the caller's address", async () => {
    const fake = fakeRpc({ data: [{ class_id: CLASS_ID, class_name: "NUR 310" }], error: null });
    expect(await resolveClassInvite(fake.client, TOKEN, "203.0.113.9")).toEqual({
      status: "open",
      classId: CLASS_ID,
      className: "NUR 310",
    });
    expect(fake.rpc).toHaveBeenCalledWith("resolve_class_invite", {
      token: TOKEN,
      client_key: "203.0.113.9",
    });
  });

  it("asks the database about a malformed token too, so it costs what an unknown one does", async () => {
    const fake = fakeRpc({ data: [], error: null });
    const malformed = await resolveClassInvite(fake.client, "not a token", null);
    const unknown = await resolveClassInvite(fake.client, "z".repeat(32), null);
    expect(malformed).toEqual({ status: "invalid" });
    expect(unknown).toEqual(malformed);
    expect(fake.rpc).toHaveBeenCalledTimes(2);
    expect(fake.rpc).toHaveBeenNthCalledWith(1, "resolve_class_invite", { token: "not a token" });
  });

  it("clips an absurdly long token before sending it", async () => {
    const fake = fakeRpc({ data: [], error: null });
    await resolveClassInvite(fake.client, "x".repeat(10_000), null);
    expect(fake.rpc).toHaveBeenCalledWith("resolve_class_invite", { token: "x".repeat(64) });
  });

  it("says rate limited when the address has spent its misses", async () => {
    const fake = fakeRpc({ data: null, error: { code: "PT429" } });
    expect(await resolveClassInvite(fake.client, TOKEN, null)).toEqual({
      status: "rate_limited",
    });
  });

  it("fails closed on any other error", async () => {
    const fake = fakeRpc({ data: null, error: { code: "08006" } });
    expect(await resolveClassInvite(fake.client, TOKEN, null)).toEqual({ status: "unavailable" });
  });
});

describe("joinClass", () => {
  it.each(["joined", "instructor", "invalid", "rate_limited"] as const)(
    "passes %s through",
    async (answer) => {
      const fake = fakeRpc({ data: answer, error: null });
      expect(await joinClass(fake.client, TOKEN)).toBe(answer);
      expect(fake.rpc).toHaveBeenCalledWith("join_class", { token: TOKEN });
    },
  );

  it("treats an answer it does not know, or an error, as unavailable", async () => {
    expect(await joinClass(fakeRpc({ data: "promoted", error: null }).client, TOKEN)).toBe(
      "unavailable",
    );
    expect(await joinClass(fakeRpc({ data: null, error: { code: "42501" } }).client, TOKEN)).toBe(
      "unavailable",
    );
  });
});

describe("myClasses", () => {
  it("lists the caller's classes by id, name and time zone", async () => {
    const fake = fakeRpc({
      data: [
        {
          class_id: CLASS_ID,
          class_name: "NUR 310",
          joined_at: "2026-09-23T10:00:00Z",
          time_zone: "America/New_York",
        },
      ],
      error: null,
    });
    expect(await myClasses(fake.client)).toEqual([
      {
        id: CLASS_ID,
        name: "NUR 310",
        joinedAt: "2026-09-23T10:00:00Z",
        timeZone: "America/New_York",
      },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("my_classes");
  });

  it("puts a class on the default zone while the database sends none (#242)", async () => {
    const fake = fakeRpc({
      data: [{ class_id: CLASS_ID, class_name: "NUR 310", joined_at: "2026-09-23T10:00:00Z" }],
      error: null,
    });
    expect((await myClasses(fake.client))?.[0]?.timeZone).toBe("America/Denver");
  });

  it("returns null when the list cannot be read", async () => {
    expect(await myClasses(fakeRpc({ data: null, error: { code: "08006" } }).client)).toBeNull();
  });
});
