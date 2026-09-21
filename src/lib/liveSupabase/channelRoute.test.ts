import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHANNEL_SESSION_CLAIM,
  CHANNEL_TOKEN_TTL_SECONDS,
  readChannelSigningKey,
} from "@/lib/supabase/channelToken";
import type { Database } from "@/lib/supabase/database.types";
import { issueChannelToken, type ChannelRouteDeps } from "./channelRoute";
import type { ChannelCredential } from "./wire";

const ME = { sessionId: "00000000-0000-4000-8000-00000000000a", participantId: "p-1" };
const URL_CHANNEL = "http://live.test/api/live/channel";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const NOW = 1_800_000_000_000;

type Answer = { data: unknown; error: unknown };

function deps(
  answer: Answer,
  verified: typeof ME | null = ME,
  signingKey: ChannelRouteDeps["signingKey"] = () => readChannelSigningKey(SECRET),
): ChannelRouteDeps & { rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => answer);
  return {
    verify: async () => verified,
    service: { rpc } as unknown as SupabaseClient<Database>,
    signingKey,
    now: () => NOW,
    rpc,
  };
}

const room = (status: string, refusal: string | null = null): Answer => ({
  data: [
    {
      refusal,
      session_status: refusal ? null : status,
      session_position: null,
      session_reveal: refusal ? null : false,
      session_items: refusal ? null : [],
    },
  ],
  error: null,
});

const post = (headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(URL_CHANNEL, { method: "POST", headers, body: "{}" });

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

describe("POST /api/live/channel", () => {
  it("mints a token for the session the cookie names, and for no other", async () => {
    const response = await issueChannelToken(post(), deps(room("running")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as ChannelCredential;
    expect(body.expiresAt).toBe(NOW + CHANNEL_TOKEN_TTL_SECONDS * 1000);
    expect(claimsOf(body.token)).toMatchObject({
      role: "anon",
      sub: ME.participantId,
      [CHANNEL_SESSION_CLAIM]: ME.sessionId,
    });
  });

  it("charges the participant's view budget, keyed on the participant the cookie named", async () => {
    const d = deps(room("lobby"));
    await issueChannelToken(post(), d);
    expect(d.rpc).toHaveBeenCalledWith("begin_session_view", {
      target_session: ME.sessionId,
      participant: ME.participantId,
    });
  });

  it("refuses a request that is not JSON before doing anything", async () => {
    const d = deps(room("running"));
    const response = await issueChannelToken(post({ "content-type": "text/plain" }), d);
    expect(response.status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("refuses without the cookie, and never reads the signing key", async () => {
    const signingKey = vi.fn(() => readChannelSigningKey(SECRET));
    const response = await issueChannelToken(post(), deps(room("running"), null, signingKey));
    expect(response.status).toBe(401);
    expect(signingKey).not.toHaveBeenCalled();
  });

  it("refuses a participant whose session is gone", async () => {
    const response = await issueChannelToken(post(), deps({ data: [], error: null }));
    expect(response.status).toBe(401);
  });

  it("passes the rate limit through as the refusal it is", async () => {
    const response = await issueChannelToken(post(), deps(room("running", "rate_limited")));
    expect(response.status).toBe(429);
  });

  it("treats a refusal code it does not know as a fault", async () => {
    const response = await issueChannelToken(post(), deps(room("running", "something_new")));
    expect(response.status).toBe(500);
  });

  it("answers a database error with a fault, not a token", async () => {
    const response = await issueChannelToken(post(), deps({ data: null, error: { code: "XX" } }));
    expect(response.status).toBe(500);
  });

  it("gives an ended room no token: there is nothing left to watch", async () => {
    const response = await issueChannelToken(post(), deps(room("ended")));
    expect(response.status).toBe(409);
    expect(((await response.json()) as { refusal: string }).refusal).toBe("not_open");
  });

  it("fails loudly when the signing key is not configured", async () => {
    await expect(
      issueChannelToken(
        post(),
        deps(room("running"), ME, () => readChannelSigningKey(undefined)),
      ),
    ).rejects.toThrow(/SUPABASE_JWT_SIGNING_KEY/);
  });
});
