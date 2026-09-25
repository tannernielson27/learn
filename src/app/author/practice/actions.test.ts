import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stop sharing, as a confirmed action reports it (#256). The Supabase client is faked, so what is
 * pinned runs from the database's reply to what the author sees: a refused delete is `ok: false`
 * in plain words, a share someone else already stopped is success, and the database's own text
 * never reaches the log.
 */

const revalidated = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated(path) }));

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
let reply: Reply;

const builder: Record<string, unknown> = {};
for (const step of ["select", "delete", "eq"]) builder[step] = () => builder;
builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
const client = { from: vi.fn(() => builder) };

const requireAuthor = vi.fn<(next: string) => Promise<{ supabase: typeof client }>>(async () => ({
  supabase: client,
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: (next: string) => requireAuthor(next),
}));

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

const { stopSharing } = await import("./actions");

const BANK = "00000000-0000-4000-8000-0000000000e0";
const CLASS = "00000000-0000-4000-8000-0000000000c1";
const FAILED = { ok: false, message: "Could not stop sharing this bank. Try again." };

beforeEach(() => {
  revalidated.mockClear();
  client.from.mockClear();
  logged.mockClear();
});

describe("stopSharing", () => {
  it("is ok and refreshes every page that shows the share", async () => {
    reply = { data: [{ id: "x" }], error: null };
    expect(await stopSharing(BANK, CLASS)).toEqual({ ok: true });
    expect(requireAuthor).toHaveBeenCalledWith(`/author/banks/${BANK}`);
    expect(client.from).toHaveBeenCalledWith("bank_practice_shares");
    expect(revalidated).toHaveBeenCalledWith(`/author/banks/${BANK}`);
    expect(revalidated).toHaveBeenCalledWith(`/author/classes/${CLASS}`);
  });

  it("treats a share someone else already stopped as done, and refreshes", async () => {
    reply = { data: [], error: null };
    expect(await stopSharing(BANK, CLASS)).toEqual({ ok: true });
    expect(revalidated).toHaveBeenCalledWith(`/author/banks/${BANK}`);
  });

  it("says so plainly when the database refuses, and logs only the code", async () => {
    reply = { data: null, error: { code: "08006", message: "connection to bank Pharm lost" } };
    expect(await stopSharing(BANK, CLASS)).toEqual(FAILED);
    expect(revalidated).not.toHaveBeenCalled();
    const log = JSON.stringify(logged.mock.calls);
    expect(log).toContain("08006");
    expect(log).not.toContain("connection to bank");
  });

  it("refuses ids that are not ids before asking the database", async () => {
    expect(await stopSharing("nope", CLASS)).toEqual(FAILED);
    expect(await stopSharing(BANK, "../x")).toEqual(FAILED);
    expect(client.from).not.toHaveBeenCalled();
  });
});
