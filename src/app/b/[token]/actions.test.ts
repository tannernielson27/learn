import { beforeEach, describe, expect, it, vi } from "vitest";
import { BETA_PASS_RATE_LIMITED, BETA_PASS_UNAVAILABLE } from "@/lib/betaPass/link";
import { BETA_PASS_REDEEM_LIMIT } from "@/lib/betaPass/redeemLimit";
import type { MemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";

/**
 * The beta pass page's Server Function is wiring. What is pinned here: the database is told the
 * account Supabase Auth verified and nothing the request carried, only the service-role client
 * asks it, every post is counted on the platform's address before anything else, every refusal
 * reads the same, and the token reaches no log.
 */

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const USER = "00000000-0000-4000-8000-0000000000a1";

const requestHeaders = new Headers({
  "x-vercel-id": "iad1::test",
  "x-vercel-forwarded-for": "203.0.113.1",
  "x-forwarded-for": "198.51.100.66",
});
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
let redeemReply: Reply;
const serviceRpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<Reply>>(
  async () => redeemReply,
);
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc: serviceRpc }),
}));

let sessionUser: { id: string } | null;
const getUser = vi.fn(async () =>
  sessionUser
    ? { data: { user: sessionUser }, error: null }
    : { data: { user: null }, error: { status: 401 } },
);
// The cookie client must never be the one that asks the database about a pass.
const cookieRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: cookieRpc, auth: { getUser } }),
}));

vi.mock("@/lib/rateLimit/postgresStore", async () => {
  const { createMemoryRateLimitStore } = await import("@/lib/rateLimit/testing/memoryStore");
  const store = createMemoryRateLimitStore();
  return { sharedRateLimitStore: () => store };
});
const rateLimitStore = (
  await import("@/lib/rateLimit/postgresStore")
).sharedRateLimitStore() as MemoryRateLimitStore;

const { acceptFreeAccess } = await import("./actions");

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
let caller = 0;

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitStore.failWith(null);
  caller += 1;
  requestHeaders.set("x-vercel-forwarded-for", `203.0.113.${caller}`);
  sessionUser = { id: USER };
  redeemReply = { data: null, error: null };
});

describe("acceptFreeAccess", () => {
  it("redeems for the verified account with the service role, then goes to authoring", async () => {
    await expect(acceptFreeAccess(TOKEN)).rejects.toThrow("redirect:/author");
    expect(serviceRpc).toHaveBeenCalledWith("redeem_beta_pass", { p_user: USER, p_token: TOKEN });
    expect(cookieRpc).not.toHaveBeenCalled();
  });

  it("answers every refusal with the one neutral state", async () => {
    redeemReply = { data: null, error: { code: "PT403", message: "this link cannot be used" } };
    expect(await acceptFreeAccess(TOKEN)).toEqual({ status: "unusable" });
    expect(redirected).not.toHaveBeenCalled();
  });

  it("counts every post on the platform's address, and refuses past the limit unasked", async () => {
    for (let i = 0; i < BETA_PASS_REDEEM_LIMIT.attempts; i += 1) {
      redeemReply = { data: null, error: { code: "PT403" } };
      expect(await acceptFreeAccess(TOKEN)).toEqual({ status: "unusable" });
    }
    serviceRpc.mockClear();
    expect(await acceptFreeAccess(TOKEN)).toEqual({
      status: "error",
      error: BETA_PASS_RATE_LIMITED,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(rateLimitStore.hits().at(-1)).toEqual({
      bucket: "beta_pass_redeem",
      key: `203.0.113.${caller}`,
    });
  });

  it("refuses when the limiter cannot answer", async () => {
    rateLimitStore.failWith(new RateLimitUnavailableError("08006"));
    expect(await acceptFreeAccess(TOKEN)).toEqual({
      status: "error",
      error: BETA_PASS_UNAVAILABLE,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("sends someone signed out back to the page, asking the database nothing", async () => {
    sessionUser = null;
    await expect(acceptFreeAccess(TOKEN)).rejects.toThrow(`redirect:/b/${TOKEN}`);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("says the page is not working when the database does not answer, and logs no token", async () => {
    redeemReply = { data: null, error: { code: "08006", message: TOKEN } };
    expect(await acceptFreeAccess(TOKEN)).toEqual({
      status: "error",
      error: BETA_PASS_UNAVAILABLE,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
  });
});
