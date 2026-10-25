import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({ auth: { getClaims } }));
vi.mock("./server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

const { verifiedAccountId } = await import("./verifiedAccount");

const ACCOUNT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

beforeEach(() => {
  getClaims.mockReset();
  createSupabaseServerClient.mockClear();
});

describe("verifiedAccountId (ADR 0013)", () => {
  it("is the subject of the verified claims", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: ACCOUNT } }, error: null });
    expect(await verifiedAccountId()).toBe(ACCOUNT);
  });

  it("is null when nobody is signed in", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await verifiedAccountId()).toBeNull();
    getClaims.mockResolvedValue({ data: { claims: { sub: "" } }, error: null });
    expect(await verifiedAccountId()).toBeNull();
  });

  it("is null, not a failure, when the claims cannot be checked: the student joins as a guest", async () => {
    getClaims.mockRejectedValue(new Error("auth is down"));
    expect(await verifiedAccountId()).toBeNull();
  });
});
