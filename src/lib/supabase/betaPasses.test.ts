import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeemBetaPass } from "./betaPasses";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const USER = "00000000-0000-4000-8000-0000000000a1";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
let reply: Reply;
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<Reply>>(
  async () => reply,
);
const service = { rpc } as unknown as Parameters<typeof redeemBetaPass>[0];
const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  reply = { data: null, error: null };
});

describe("redeemBetaPass", () => {
  it("redeems for the verified account with the token", async () => {
    expect(await redeemBetaPass(service, USER, TOKEN)).toBe("redeemed");
    expect(rpc).toHaveBeenCalledWith("redeem_beta_pass", { p_user: USER, p_token: TOKEN });
  });

  it("clips an oversized token before it reaches the database", async () => {
    await redeemBetaPass(service, USER, "x".repeat(5000));
    const sent = rpc.mock.calls[0]?.[1]?.p_token as string;
    expect(sent.length).toBeLessThan(5000);
  });

  it("reads the one refusal as refused, and logs nothing for it", async () => {
    reply = { data: null, error: { code: "PT403", message: "this link cannot be used" } };
    expect(await redeemBetaPass(service, USER, TOKEN)).toBe("refused");
    expect(logged).not.toHaveBeenCalled();
  });

  it("reads any other error as unavailable, logging its code and never the token", async () => {
    reply = { data: null, error: { code: "08006", message: `broke on ${TOKEN}` } };
    expect(await redeemBetaPass(service, USER, TOKEN)).toBe("unavailable");
    expect(JSON.stringify(logged.mock.calls)).toContain("08006");
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(USER);
  });
});
