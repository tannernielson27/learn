import { describe, expect, it } from "vitest";
import { CONFORMANCE_ITEMS } from "@/lib/live/roomConformance";
import { mintChannelToken } from "@/lib/supabase/channelToken";
import { FAKE_JWT_SECRET, createFakeClient, type FakeIdentity } from "./testing/fakeSupabase";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";
import { liveTopic } from "./wire";

/**
 * #149: the session channel is private, and a participant's token opens their own room and no
 * other.
 *
 * The fake Realtime here verifies each token's HS256 signature and evaluates the same rule the
 * `realtime.messages` policies in `20260921210000_private_live_channel.sql` say, so what these
 * tests pin is the *application's* half: that the token a phone ends up holding is minted by the
 * server from the participant cookie, names the cookie's session, and is what the channel is
 * opened with. The SQL half — that Postgres really does refuse session B to a token for session A
 * — is `supabase/tests/database/live_private_channel.test.sql`.
 */

const SESSION_A = "00000000-0000-0000-0000-00000000aaaa";
const SESSION_B = "00000000-0000-0000-0000-00000000bbbb";
const KEY = { alg: "HS256" as const, secret: FAKE_JWT_SECRET };

/** Room A, with a second session B standing in the same database, in the same org. */
function twoRooms(): FakeRoom {
  const live = createFakeRoom({ items: CONFORMANCE_ITEMS, code: "LEARN7", sessionId: SESSION_A });
  const [a] = live.stack.sessions;
  live.stack.sessions.push({ ...a, id: SESSION_B, code: "LEARN8" });
  return live;
}

/** Subscribes a bare channel and reports what Realtime said. */
function subscribeAs(live: FakeRoom, identity: FakeIdentity, sessionId: string): Promise<string> {
  const client = createFakeClient(live.stack, identity);
  return new Promise((resolve) => {
    client
      .channel(liveTopic(sessionId), { config: { private: true } })
      .subscribe((status) => resolve(status));
  });
}

async function joinedAda(live: FakeRoom): Promise<string> {
  const ada = live.participant();
  await ada.join(live.code, { displayName: "Ada" });
  await live.settle();
  const row = live.stack.participants.find((person) => person.display_name === "Ada");
  if (!row) throw new Error("Ada did not join");
  return row.id;
}

describe("the private session channel (#149)", () => {
  it("lets a participant of session A into A, and refuses them session B", async () => {
    const live = twoRooms();
    const adaId = await joinedAda(live);
    const tokenForA = mintChannelToken({ sessionId: SESSION_A, participantId: adaId }, KEY).token;
    const ada: FakeIdentity = { role: "anon", accessToken: async () => tokenForA };

    expect(await subscribeAs(live, ada, SESSION_A)).toBe("SUBSCRIBED");
    expect(await subscribeAs(live, ada, SESSION_B)).toBe("CHANNEL_ERROR");
  });

  it("gives a phone that asks to open session B the server's token for A, which B refuses", async () => {
    // The page is the one that names the room, and a tampered page could name any room. What it
    // cannot do is choose the token: the channel route mints from the cookie, and the cookie says A.
    const live = twoRooms();
    const adaId = await joinedAda(live);
    const phone = live.resuming(adaId);

    await expect(phone.resume({ ...live.identityOf(adaId), sessionId: SESSION_B })).rejects.toThrow(
      /CHANNEL_ERROR/,
    );
  });

  it("refuses the publishable key alone: knowing a session id is no longer enough", async () => {
    const live = twoRooms();
    expect(await subscribeAs(live, { role: "anon" }, SESSION_A)).toBe("CHANNEL_ERROR");
  });

  it("refuses a token signed with any other key", async () => {
    const live = twoRooms();
    const adaId = await joinedAda(live);
    const forged = mintChannelToken(
      { sessionId: SESSION_A, participantId: adaId },
      { alg: "HS256", secret: "not-the-project-secret-but-long-enough-to-pass" },
    ).token;
    expect(
      await subscribeAs(live, { role: "anon", accessToken: async () => forged }, SESSION_A),
    ).toBe("CHANNEL_ERROR");
  });

  it("refuses an expired token", async () => {
    const live = twoRooms();
    const adaId = await joinedAda(live);
    const stale = mintChannelToken(
      { sessionId: SESSION_A, participantId: adaId },
      KEY,
      Date.now() - 2 * 60 * 60 * 1000,
    ).token;
    expect(
      await subscribeAs(live, { role: "anon", accessToken: async () => stale }, SESSION_A),
    ).toBe("CHANNEL_ERROR");
  });

  it("keeps a forged name out of the instructor's roster", async () => {
    const live = twoRooms();
    const host = live.host();
    await host.open();
    await joinedAda(live);

    const stranger = createFakeClient(live.stack, { role: "anon" });
    const channel = stranger.channel(liveTopic(SESSION_A), {
      config: { private: true, presence: { key: "intruder" } },
    });
    const status = await new Promise<string>((resolve) => {
      channel.subscribe((next) => resolve(next));
    });
    expect(status).toBe("CHANNEL_ERROR");
    await expect(
      channel.track({ participantId: "intruder", displayName: "Nobody" }),
    ).rejects.toThrow();
    await live.settle();

    expect([...live.stack.presenceFor(liveTopic(SESSION_A)).keys()]).not.toContain("intruder");
  });

  it("lets a host into a session in their own org, and not into another org's", async () => {
    const live = twoRooms();
    expect(await subscribeAs(live, { role: "authenticated", orgId: live.orgId }, SESSION_B)).toBe(
      "SUBSCRIBED",
    );
    expect(
      await subscribeAs(
        live,
        { role: "authenticated", orgId: "00000000-0000-0000-0000-00000000dead" },
        SESSION_A,
      ),
    ).toBe("CHANNEL_ERROR");
  });
});
