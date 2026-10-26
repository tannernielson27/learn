import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({ auth: { getClaims } }));
vi.mock("./server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

const { verifiedAccount } = await import("./verifiedAccount");

const ACCOUNT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

beforeEach(() => {
  getClaims.mockReset();
  createSupabaseServerClient.mockClear();
});

describe("verifiedAccount (ADR 0013, decision 2)", () => {
  it("is signed in, with the subject of the verified claims", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: ACCOUNT } }, error: null });
    expect(await verifiedAccount()).toEqual({ status: "signed_in", id: ACCOUNT });
  });

  it("is signed out only when there is no session to check", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await verifiedAccount()).toEqual({ status: "signed_out" });
  });

  it("is unavailable, never signed out, when the claims could not be checked", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("jwks unreachable") });
    expect(await verifiedAccount()).toEqual({ status: "unavailable" });
    getClaims.mockRejectedValue(new Error("auth is down"));
    expect(await verifiedAccount()).toEqual({ status: "unavailable" });
    createSupabaseServerClient.mockRejectedValueOnce(new Error("no env"));
    expect(await verifiedAccount()).toEqual({ status: "unavailable" });
  });

  it("is unavailable when verified claims name nobody", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "" } }, error: null });
    expect(await verifiedAccount()).toEqual({ status: "unavailable" });
  });
});
