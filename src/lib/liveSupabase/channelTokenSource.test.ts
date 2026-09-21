import { describe, expect, it, vi } from "vitest";
import { CHANNEL_TOKEN_REFRESH_AHEAD_MS, createChannelTokenSource } from "./channelTokenSource";
import { LIVE_ROUTES } from "./wire";

const T0 = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function fetchAnswering(...answers: (Response | Error)[]) {
  return vi.fn<typeof globalThis.fetch>(async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error("no more answers scripted");
    if (next instanceof Error) throw next;
    return next;
  });
}

const fresh = (token: string, expiresAt: number) => Response.json({ token, expiresAt });

describe("createChannelTokenSource", () => {
  it("answers with the server-rendered token while it has more than five minutes left", async () => {
    const fetch = fetchAnswering();
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 + HOUR },
      fetch,
      now: () => T0,
    });
    expect(await source()).toBe("first");
    expect(await source()).toBe("first");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the next token from the channel route, with the cookie, inside the last five minutes", async () => {
    let now = T0;
    const fetch = fetchAnswering(fresh("second", T0 + 2 * HOUR));
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 + HOUR },
      fetch,
      baseUrl: "http://live.test",
      now: () => now,
    });

    now = T0 + HOUR - CHANNEL_TOKEN_REFRESH_AHEAD_MS;
    expect(await source()).toBe("second");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`http://live.test${LIVE_ROUTES.channel}`);
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });

    // And holds the new one: no second request while it is fresh.
    expect(await source()).toBe("second");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers a phone that slept through its expiry on the first heartbeat after waking", async () => {
    const fetch = fetchAnswering(fresh("after-sleep", T0 + 3 * HOUR));
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 + HOUR },
      fetch,
      now: () => T0 + 2 * HOUR,
    });
    expect(await source()).toBe("after-sleep");
  });

  it("shares one request between heartbeats that land together", async () => {
    const fetch = fetchAnswering(fresh("second", T0 + 2 * HOUR));
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 },
      fetch,
      now: () => T0,
    });
    expect(await Promise.all([source(), source(), source()])).toEqual([
      "second",
      "second",
      "second",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never rejects: a refused, broken or failed refresh answers with the token it holds", async () => {
    const fetch = fetchAnswering(
      Response.json({ refusal: "rate_limited" }, { status: 429 }),
      Response.json({ token: 42 }),
      new Error("offline"),
      fresh("finally", T0 + 2 * HOUR),
    );
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 },
      fetch,
      now: () => T0,
    });
    expect(await source()).toBe("first");
    expect(await source()).toBe("first");
    expect(await source()).toBe("first");
    // And tries again next time, rather than giving up for good.
    expect(await source()).toBe("finally");
  });

  it("does not wedge when fetch throws synchronously", async () => {
    let calls = 0;
    const fetch = vi.fn((() => {
      calls += 1;
      if (calls === 1) throw new Error("synchronous");
      return Promise.resolve(fresh("second", T0 + 2 * HOUR));
    }) as unknown as typeof globalThis.fetch);
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 },
      fetch,
      now: () => T0,
    });
    expect(await source()).toBe("first");
    expect(await source()).toBe("second");
  });
});
