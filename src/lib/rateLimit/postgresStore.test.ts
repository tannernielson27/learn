import { describe, expect, it, vi } from "vitest";
import {
  createPostgresRateLimitStore,
  sharedRateLimitStore,
  type RateLimitRpc,
} from "./postgresStore";
import { RateLimitUnavailableError } from "./store";

const SECRET = "sb_secret_test_only_0123456789abcdef";
const LIMIT = { attempts: 30, windowMs: 5 * 60_000 } as const;

function rpcAnswering(answer: { data: unknown; error: { code?: string } | null }) {
  return vi.fn<RateLimitRpc>(async () => answer as Awaited<ReturnType<RateLimitRpc>>);
}

function storeWith(rpc: RateLimitRpc, secret: () => string = () => SECRET) {
  return createPostgresRateLimitStore({ rpc: () => rpc, secret });
}

describe("createPostgresRateLimitStore", () => {
  it("asks hit_rate_limit with the bucket, a digest of the key, and the limit in seconds", async () => {
    const rpc = rpcAnswering({ data: true, error: null });
    await expect(storeWith(rpc).hit("sign_in_email", "203.0.113.7", LIMIT)).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe("hit_rate_limit");
    expect(args).toEqual({
      bucket_name: "sign_in_email",
      key_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      max_hits: 30,
      window_seconds: 300,
    });
  });

  it("never sends an IP address or an email address in the clear", async () => {
    const rpc = rpcAnswering({ data: true, error: null });
    const store = storeWith(rpc);
    await store.hit("sign_in_address_pair", "203.0.113.7|nurse@school.edu", LIMIT);
    await store.hit("sign_in_address", "nurse@school.edu", LIMIT);

    const sent = JSON.stringify(rpc.mock.calls);
    expect(sent).not.toContain("203.0.113.7");
    expect(sent).not.toContain("nurse");
    expect(sent).not.toContain("school.edu");
  });

  it("passes the refusal through", async () => {
    const rpc = rpcAnswering({ data: false, error: null });
    await expect(storeWith(rpc).hit("sign_in_demo", "203.0.113.7", LIMIT)).resolves.toBe(false);
  });

  it("gives the same key the same digest, and a different one in another bucket", async () => {
    const rpc = rpcAnswering({ data: true, error: null });
    const store = storeWith(rpc);
    await store.hit("sign_in_email", "203.0.113.7", LIMIT);
    await store.hit("sign_in_email", "203.0.113.7", LIMIT);
    await store.hit("sign_in_demo", "203.0.113.7", LIMIT);
    const digests = rpc.mock.calls.map(([, args]) => args.key_digest);
    expect(digests[0]).toBe(digests[1]);
    expect(digests[2]).not.toBe(digests[0]);
  });

  it("keys the digest on the server secret, so another deployment's digests do not match", async () => {
    const first = rpcAnswering({ data: true, error: null });
    const second = rpcAnswering({ data: true, error: null });
    await storeWith(first).hit("sign_in_email", "203.0.113.7", LIMIT);
    await storeWith(second, () => "sb_secret_another_deployment_000000").hit(
      "sign_in_email",
      "203.0.113.7",
      LIMIT,
    );
    expect(first.mock.calls[0]![1].key_digest).not.toBe(second.mock.calls[0]![1].key_digest);
  });

  it("rejects when the database returns an error", async () => {
    const rpc = rpcAnswering({ data: null, error: { code: "PGRST202" } });
    const hit = storeWith(rpc).hit("sign_in_email", "203.0.113.7", LIMIT);
    await expect(hit).rejects.toBeInstanceOf(RateLimitUnavailableError);
    await expect(hit).rejects.toThrow("PGRST202");
  });

  it("rejects when the answer is not a boolean", async () => {
    const rpc = rpcAnswering({ data: "yes", error: null });
    await expect(storeWith(rpc).hit("sign_in_email", "x", LIMIT)).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
  });

  it("rejects when the call itself throws, as a network failure does", async () => {
    const rpc = vi.fn<RateLimitRpc>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(storeWith(rpc).hit("sign_in_email", "x", LIMIT)).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
  });

  it("rejects, and never calls the database, when the server secret is missing", async () => {
    const rpc = rpcAnswering({ data: true, error: null });
    const store = storeWith(rpc, () => {
      throw new Error("SUPABASE_SECRET_KEY is not set.");
    });
    await expect(store.hit("sign_in_email", "x", LIMIT)).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rounds a window up to whole seconds", async () => {
    const rpc = rpcAnswering({ data: true, error: null });
    await storeWith(rpc).hit("cron_runs", "runs", { attempts: 4, windowMs: 1_500 });
    expect(rpc.mock.calls[0]![1].window_seconds).toBe(2);
  });
});

describe("sharedRateLimitStore", () => {
  it("is one store for the whole process", () => {
    expect(sharedRateLimitStore()).toBe(sharedRateLimitStore());
  });
});

describe("creating a store", () => {
  it("reads no secret and builds no client until the first hit", async () => {
    const secret = vi.fn(() => SECRET);
    const rpc = rpcAnswering({ data: true, error: null });
    const build = vi.fn(() => rpc);
    const store = createPostgresRateLimitStore({ rpc: build, secret });
    expect(secret).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    await store.hit("sign_in_email", "x", LIMIT);
    await store.hit("sign_in_email", "x", LIMIT);
    expect(secret).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
