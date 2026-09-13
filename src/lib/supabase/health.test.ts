import { describe, expect, it, vi } from "vitest";
import { checkSupabaseHealth } from "./health";

const env = {
  url: "https://abcdefghijklmnopqrst.supabase.co",
  publishableKey: "sb_publishable_example",
};

describe("checkSupabaseHealth", () => {
  it("reports ok when the auth service answers 200, sending only the publishable key", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(checkSupabaseHealth(env, fetchImpl)).resolves.toEqual({ status: "ok" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://abcdefghijklmnopqrst.supabase.co/auth/v1/health",
      expect.objectContaining({
        headers: { apikey: "sb_publishable_example" },
        cache: "no-store",
      }),
    );
  });

  it("reports unreachable on a non-2xx answer", async () => {
    const fetchImpl = vi.fn(async () => new Response("paused", { status: 503 }));
    await expect(checkSupabaseHealth(env, fetchImpl)).resolves.toEqual({ status: "unreachable" });
  });

  it("reports unreachable when the request throws, without leaking the error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND with secrets in it");
    });
    const result = await checkSupabaseHealth(env, fetchImpl);
    expect(result).toEqual({ status: "unreachable" });
    expect(JSON.stringify(result)).not.toContain("ENOTFOUND");
  });

  it("gives up after the timeout instead of hanging the route", async () => {
    const fetchImpl = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    await expect(checkSupabaseHealth(env, fetchImpl, 10)).resolves.toEqual({
      status: "unreachable",
    });
  });
});
